import re, json
src = open(__import__('os').path.join(__import__('os').path.dirname(__file__), '..', '..', 'screenplay.md')).read().split('\n')
start = next(i for i,l in enumerate(src) if l.strip()=='SCREENPLAY')
NONSPEAK = {'PICTURE','SOUND','TITLE','ON-SCREEN LOCATION','FINAL PICTURE','BACK IN THE TREATMENT ROOM'}
scene = 'PROLOGUE'
lines=[]
for i in range(start, len(src)):
    l = src[i].strip()
    m = re.match(r'^(PROLOGUE|SCENE (\w+)|END TITLES|TITLE:)', l)
    if l.startswith('PROLOGUE'): scene='PROLOGUE'
    elif l.startswith('TITLE:'): scene='TITLE'
    elif re.match(r'^SCENE \w+ ', l): scene=re.match(r'^SCENE (\w+)', l).group(1)
    elif l=='END TITLES': scene='END'
    m = re.match(r'^([A-Z][A-Z \']+?)(\s*\[([^\]]*)\])?:$', l)
    if m and m.group(1).strip() not in NONSPEAK:
        q = src[i+1].strip()
        assert q.startswith('"'), (i,l,q)
        text = q.strip('"')
        lines.append(dict(id='L%03d'%(len(lines)+1), scene=scene, speaker=m.group(1).strip(), note=m.group(3) or '', text=text, src_line=i+1, words=len(re.findall(r"[A-Za-z0-9']+", text))))
json.dump(lines, open(__import__('os').path.join(__import__('os').path.dirname(__file__), 'lines.json'),'w'), indent=1)
for x in lines: print(x['id'], x['scene'], x['speaker'], '|', x['note'], '|', x['text'][:70], x['words'])
print(len(lines), sum(x['words'] for x in lines))
