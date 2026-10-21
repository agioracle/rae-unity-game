#!/usr/bin/env python3
"""Bounded, explicit PNG region for numeric OCR. Original capture is unchanged."""
import argparse,json,sys,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent.parent/'skills/unity-game-reconstruction/scripts'))
from package_safety import StableInput

def crop(source,destination,x,y,width,height,scale,light_text_threshold=None):
    from PIL import Image,__version__ as pillow_version
    Image.MAX_IMAGE_PIXELS=16*1024*1024
    stable=StableInput.open(Path(source))
    try:
        if stable.size>16*1024*1024:raise ValueError('PNG exceeds 16 MiB')
        # Pillow reads format/size before allocating pixel data. Only native
        # screenshot formats are admitted, with byte/pixel/frame caps.
        with Image.open(stable.handle,formats=['PNG','JPEG']) as image:
            w,h=image.size
            if image.format not in ('PNG','JPEG') or getattr(image,'n_frames',1)!=1:raise ValueError('Expected single-frame PNG or JPEG')
            image_format=image.format
            if not(0<w*h<=16*1024*1024 and 0<=x and 0<=y and width>0 and height>0 and x+width<=w and y+height<=h and 1<=scale<=4 and width*height*scale*scale<=16*1024*1024):raise ValueError('Image or ROI exceeds budget')
            image.load();region=image.crop((x,y,x+width,y+height)).convert('RGBA')
            if region.getchannel('A').getextrema()!=(255,255):raise ValueError('Selected ROI contains transparent pixels; visible numeric content is ambiguous')
            region=region.convert('RGB')
            if light_text_threshold is not None:
                if not 200<=light_text_threshold<=250:raise ValueError('Light text threshold exceeds reviewed range')
                region=region.convert('L').point(lambda v:0 if v>=light_text_threshold else 255,mode='1').convert('RGB')
            if scale!=1:region=region.resize((width*scale,height*scale),Image.Resampling.LANCZOS)
            with open(destination,'xb') as output:region.save(output,format='PNG')
        stable.verify_unchanged()
        return {'source_sha256':stable.sha256,'producer':{'helper_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'python':sys.version.split()[0],'pillow':pillow_version},'dimensions':[w,h],'format':image_format,'roi':[x,y,width,height],'scale':scale,'light_text_threshold':light_text_threshold,'output':destination}
    finally:stable.close()
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--output',required=True)
    for name in ['x','y','width','height','scale']:p.add_argument('--'+name,type=int,required=True)
    p.add_argument('--light-text-threshold',type=int)
    a=p.parse_args()
    print(json.dumps(crop(a.input,a.output,a.x,a.y,a.width,a.height,a.scale,a.light_text_threshold)))
