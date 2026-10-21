#!/usr/bin/env python3
"""Measure one explicitly reviewed visible RGB signal; no semantic inference."""
import argparse,json,hashlib
from pathlib import Path
from ui_crop import crop

def measure(source,destination,roi,rgb):
 preparation=crop(source,destination,roi['x'],roi['y'],roi['width'],roi['height'],1)
 from PIL import Image
 with Image.open(destination) as image:
  pixels=image.convert('RGB').get_flattened_data() if hasattr(image,'get_flattened_data') else image.convert('RGB').getdata()
  count=sum(all(rgb['min'][i]<=p[i]<=rgb['max'][i] for i in range(3)) for p in pixels)
 total=roi['width']*roi['height'];return{'preparation':preparation,'matching_pixels':count,'total_pixels':total,'fraction':count/total,'helper_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
if __name__=='__main__':
 p=argparse.ArgumentParser()
 for key in ['input','output','roi','rgb']:p.add_argument('--'+key,required=True)
 a=p.parse_args();print(json.dumps(measure(a.input,a.output,json.loads(a.roi),json.loads(a.rgb))))
