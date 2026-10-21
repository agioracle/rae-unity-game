import AppKit
import CoreGraphics
import Foundation

func fail(_ message: String) -> Never { fputs(message + "\n", stderr); exit(2) }
let args = CommandLine.arguments
if args.count == 2 && args[1] == "--request-permission" {
    print(CGRequestPostEventAccess() ? "PostEvent permission is available" : "PostEvent permission remains unavailable; enable this test helper or its responsible app in macOS Accessibility settings")
    exit(0)
}
if args.count != 9 && args.count != 10 { fail("usage: helper exact-app reference-width reference-height x y count NEW-trace.json delay-ms [hold-ms]") }
let appURL = URL(fileURLWithPath: args[1]).standardizedFileURL
let referenceWidth = Double(args[2]) ?? 0, referenceHeight = Double(args[3]) ?? 0
let x = Double(args[4]) ?? -1, y = Double(args[5]) ?? -1
let count = Int(args[6]) ?? 0, delay = Double(args[8]) ?? 0
let hold = args.count == 10 ? (Double(args[9]) ?? -1) : 120
if ![referenceWidth,referenceHeight,x,y,delay,hold].allSatisfy({ $0.isFinite }) || referenceWidth <= 0 || referenceHeight <= 0 || x < 0 || y < 0 || x >= referenceWidth || y >= referenceHeight || count < 1 || count > 30 || delay < 50 || delay > 1000 || hold < 20 || hold > 5000 || Double(count) * (hold + delay + 120) > 60000 { fail("input case exceeds bounds") }
let output = URL(fileURLWithPath: args[7])
if FileManager.default.fileExists(atPath: output.path) { fail("trace output already exists; no input sent") }
if !CGPreflightPostEventAccess() { fail("BLOCKED: macOS PostEvent permission is unavailable; no input sent") }
let apps = NSWorkspace.shared.runningApplications.filter { $0.bundleURL?.standardizedFileURL == appURL }
if apps.count != 1 { fail("exactly one owned player process must match the selected application path") }
let app = apps[0], pid = app.processIdentifier
guard let expectedTitle = Bundle(url: appURL)?.object(forInfoDictionaryKey: "CFBundleName") as? String, !expectedTitle.isEmpty else { fail("owned player title is unavailable") }
app.activate()
let deadline = Date().addingTimeInterval(2)
while NSWorkspace.shared.frontmostApplication?.processIdentifier != pid && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
func ownedWindow() -> CGRect {
    if NSWorkspace.shared.frontmostApplication?.processIdentifier != pid { fail("foreground changed; no further input sent") }
    guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { fail("window inventory unavailable") }
    let windows = list.filter { ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid && ($0[kCGWindowLayer as String] as? NSNumber)?.intValue == 0 && ($0[kCGWindowName as String] as? String) == expectedTitle }
    if windows.count != 1 { fail("player window is absent or ambiguous: \(windows)") }
    guard let bounds = windows[0][kCGWindowBounds as String] as? [String: Any], let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary), rect.width > 0, rect.height > 0 else { fail("invalid player bounds") }
    return rect
}
var trace: [[String: Any]] = []
for index in 0..<count {
    let rect = ownedWindow()
    let point = CGPoint(x: rect.minX + x * rect.width / referenceWidth, y: rect.minY + y * rect.height / referenceHeight)
    guard let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left), let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left) else { fail("mouse event allocation failed") }
    guard let move = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left) else { fail("mouse move allocation failed") }
    move.flags = []; move.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.12)
    _ = ownedWindow()
    down.flags = []; up.flags = []
    down.post(tap: .cghidEventTap); Thread.sleep(forTimeInterval: hold / 1000); up.post(tap: .cghidEventTap)
    trace.append(["index": index, "pid": pid, "hold_ms":hold, "window": [rect.minX,rect.minY,rect.width,rect.height], "global_point": [point.x,point.y]])
    Thread.sleep(forTimeInterval: delay / 1000)
}
let payload: [String: Any] = ["application": appURL.path, "pid": pid, "events": trace, "input": "CGEvent HID path; exact foreground process/window checked before each click", "assertions_status": "not_evaluated"]
let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
try data.write(to: output, options: .withoutOverwriting)
print("posted \(count) bounded clicks; inspect visible output separately")
