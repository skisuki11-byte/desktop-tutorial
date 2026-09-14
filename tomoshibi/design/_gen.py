# -*- coding: utf-8 -*-
"""アートボードの共通部分をここで組み立てる。手で同じSVGを何度も書かないため。"""
import io

HEAD = '''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">
  <style>
    body { margin:0; font-family:"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN",sans-serif; }
    a { color:#33708F; } a:hover { color:#245A76; }
  </style>
</helmet>
'''
FOOT = '''</x-dc>
</body>
</html>
'''

def frame(inner, bg='#FDFAF2'):
    return ('<div style="width:390px;height:844px;background:%s;color:#33302A;'
            'display:flex;flex-direction:column;overflow:hidden">\n%s\n</div>\n' % (bg, inner))

def dog(px=132, happy=False):
    """手描き風の犬。happy=True で目を細めて口角を上げる（おまいりのあとの反応用）。"""
    eyes = ('<path d="M52 41 C54 38 58 38 60 41" stroke="#5A4A3A" stroke-width="2.6" stroke-linecap="round" fill="none"/>'
            '<path d="M70 41 C72 38 76 38 78 41" stroke="#5A4A3A" stroke-width="2.6" stroke-linecap="round" fill="none"/>'
            if happy else
            '<circle cx="56" cy="41" r="2.8" fill="#5A4A3A"/><circle cx="74" cy="41" r="2.8" fill="#5A4A3A"/>'
            '<circle cx="57" cy="40" r="1" fill="#FFFFFF"/><circle cx="75" cy="40" r="1" fill="#FFFFFF"/>')
    mouth = ('<path d="M59 58 C62 63 68 63 71 58" stroke="#5A4A3A" stroke-width="2" stroke-linecap="round" fill="none"/>'
             if happy else
             '<path d="M61 59 C63 61 67 61 69 59" stroke="#5A4A3A" stroke-width="1.8" stroke-linecap="round" fill="none"/>')
    tail = ('<path d="M88 96 C102 96 108 84 103 73" stroke="#5A4A3A" stroke-width="2.6" stroke-linecap="round" fill="none"/>'
            if happy else
            '<path d="M88 96 C101 93 106 80 101 70" stroke="#5A4A3A" stroke-width="2.6" stroke-linecap="round" fill="none"/>')
    return ('<svg width="%d" height="%d" viewBox="0 0 120 120" fill="none">'
        '<path d="M40 110 C33 94 35 72 48 62 C58 54 72 54 82 62 C95 72 97 94 90 110 Z" fill="#E3C49B" stroke="#5A4A3A" stroke-width="2.6" stroke-linejoin="round"/>'
        '%s'
        '<path d="M46 32 C36 26 30 36 35 48 C38 55 46 55 49 47 Z" fill="#C9A87E" stroke="#5A4A3A" stroke-width="2.6" stroke-linejoin="round"/>'
        '<path d="M84 32 C94 26 100 36 95 48 C92 55 84 55 81 47 Z" fill="#C9A87E" stroke="#5A4A3A" stroke-width="2.6" stroke-linejoin="round"/>'
        '<circle cx="65" cy="46" r="23" fill="#E3C49B" stroke="#5A4A3A" stroke-width="2.6"/>'
        '<ellipse cx="65" cy="56" rx="12" ry="9" fill="#F2E2CB" stroke="#5A4A3A" stroke-width="2.2"/>'
        '<ellipse cx="65" cy="51" rx="3.8" ry="2.8" fill="#5A4A3A"/>'
        '<path d="M65 54 v3" stroke="#5A4A3A" stroke-width="1.8" stroke-linecap="round"/>'
        '%s%s'
        '<circle cx="47" cy="52" r="3.4" fill="#EFB3AE" opacity=".6"/><circle cx="83" cy="52" r="3.4" fill="#EFB3AE" opacity=".6"/>'
        '</svg>') % (px, px, tail, mouth, eyes)

def flower(px=22, petal='#E8A0A0', core='#FBF0DA'):
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none">'
        '<g fill="%s" stroke="#5A4A3A" stroke-width="1.5">'
        '<ellipse cx="12" cy="6.4" rx="3.4" ry="4.2"/><ellipse cx="17" cy="10" rx="4.2" ry="3.4"/>'
        '<ellipse cx="15.1" cy="16" rx="3.4" ry="4.2"/><ellipse cx="8.9" cy="16" rx="3.4" ry="4.2"/>'
        '<ellipse cx="7" cy="10" rx="4.2" ry="3.4"/></g>'
        '<circle cx="12" cy="12" r="3.2" fill="%s" stroke="#5A4A3A" stroke-width="1.5"/>'
        '</svg>') % (px, px, petal, core)

TAB_ICONS = {
 'home': '<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10.5V20h11v-9.5"/>',
 'niwa': '<circle cx="12" cy="9" r="3.2"/><path d="M12 12.2V20"/><path d="M8.6 6.4 6 4.6M15.4 6.4 18 4.6M8.6 11.6 6 13.4M15.4 11.6 18 13.4"/>',
 'album': '<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M3.5 15.5 8 11l3.8 3.8 3.2-3.2 5.5 5.4"/>',
 'ugoku': '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 11.2 21 8.4v7.2L16 12.8Z"/>',
}
TAB_LABEL = {'home':'おうち','niwa':'おまいりの庭','album':'アルバム','ugoku':'うごく'}

def tabbar(active):
    cells = []
    for k in ['home','niwa','album','ugoku']:
        on = (k == active)
        col = '#9A6A1B' if on else '#A69C8C'
        w = '700' if on else '500'
        cells.append(
          '<div style="display:flex;flex-direction:column;align-items:center;gap:3px;color:%s">'
          '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" '
          'stroke-linecap="round" stroke-linejoin="round">%s</svg>'
          '<span style="font-size:10px;font-weight:%s">%s</span></div>' % (col, TAB_ICONS[k], w, TAB_LABEL[k]))
    return ('<nav style="display:grid;grid-template-columns:repeat(4,1fr);border-top:2px solid #EDE4D2;'
            'background:#FFFFFF;padding:9px 4px 16px">%s</nav>' % ''.join(cells))

def title(t, sub=''):
    s = ('<p style="margin:4px 0 0;font-size:13px;color:#857C6E">%s</p>' % sub) if sub else ''
    return ('<div style="padding:22px 20px 4px">'
            '<h1 style="margin:0;font-family:\'Zen Maru Gothic\',sans-serif;font-weight:700;'
            'font-size:22px;letter-spacing:.06em">%s</h1>%s</div>' % (t, s))

def write(name, inner, bg='#FDFAF2'):
    io.open(name, 'w', encoding='utf-8').write(HEAD + frame(inner, bg) + FOOT)
    print('wrote', name)
