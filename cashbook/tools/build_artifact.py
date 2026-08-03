# -*- coding: utf-8 -*-
"""claude.ai で公開する単一ファイル版を組み立てる。

Artifact は外部ホストへの通信が一切できず、<!doctype>/<html>/<head>/<body> も
自前で書かない決まりなので、
  ・CSS と JS とデータを全部インラインにする
  ・外部通信を伴う機能（AIのカメラ読み取り）を止める
  ・.xlsx は保存できないので CSV に切り替える
  ・Service Worker は登録しない（配信元が違うため）
という差分をここで当てる。アプリ本体のコードは共通のまま。
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'dist', 'artifact.html')

JS_ORDER = ['data/ledger.js', 'js/auth.js', 'js/xlsx.js', 'js/pdf.js', 'js/store.js',
            'js/sync.js', 'js/ocr.js', 'js/app.js']


def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


def seed_from_backup(path):
    """アプリが書き出したJSONを、そのまま埋め込める形にする。

    帳簿データをリポジトリに置かずに済むよう、--data で渡せるようにしている。
    残高のつながりが合わないものは、埋め込む前にここで止める。
    """
    with open(path, encoding='utf-8') as f:
        d = json.load(f)
    if not d.get('entries'):
        raise SystemExit('明細が入っていません: ' + path)
    if not d.get('opening') or d['opening'].get('amount') is None:
        raise SystemExit('前年度繰越金が入っていません: ' + path)

    # 残高の突き合わせ。行が持ちうる残高欄は2種類あり、両方を見る。
    #   bookBalance … 手書きノートに書かれていた残高（写真から読んだ独立の値）
    #   balance     … アプリが計算して持っている残高
    # アプリで追加した行は bookBalance を持たないので、balance も見ないと
    # その行だけ検算されないまま通ってしまう。
    rows = sorted(d['entries'], key=lambda e: e.get('no') or 0)
    bal = round(float(d['opening']['amount']))
    bad = []
    checked = 0
    naked = []
    for e in rows:
        bal += round(float(e.get('income') or 0)) - round(float(e.get('expense') or 0))
        found = False
        for field, label in (('bookBalance', '記帳'), ('balance', 'アプリ')):
            v = e.get(field)
            if v is None:
                continue
            found = True
            checked += 1
            if round(float(v)) != bal:
                bad.append('No.%s %s残高%s / 計算%s' % (e.get('no'), label, v, bal))
        if not found:
            naked.append(str(e.get('no')))
    if bad:
        raise SystemExit('残高が合いません:\n  ' + '\n  '.join(bad))

    when = d.get('exportedAt')
    print('取り込み: %d件 / 現在残高 %s（残高欄 %d か所を検算）'
          % (len(rows), format(bal, ','), checked))
    print('書き出し日時: %s' % (when if when else '（記載なし。古い版で書き出されたJSONです）'))
    if naked:
        print('※ 残高欄を持たない行が %d 件あり、その行は突き合わせていません: No.%s'
              % (len(naked), ', '.join(naked[:20]) + (' ほか' if len(naked) > 20 else '')))
    return 'window.LEDGER_SEED = %s;\n' % json.dumps(
        {'title': d.get('title') or '出納帳', 'opening': d['opening'], 'entries': rows},
        ensure_ascii=False, indent=1)


def body_of(html):
    """index.html から <body> の中身だけを取り出す（script タグは除く）。"""
    m = re.search(r'<body[^>]*>(.*)</body>', html, re.S)
    inner = m.group(1)
    inner = re.sub(r'<script\b.*?</script>', '', inner, flags=re.S)
    return inner.strip()


def main(data_path=None):
    css = read('css/style.css')
    body = body_of(read('index.html'))
    seed = seed_from_backup(data_path) if data_path else None

    def part(p):
        if p == 'data/ledger.js' and seed is not None:
            return seed
        return read(p)

    js = '\n'.join('/* ===== %s ===== */\n%s' % (p, part(p)) for p in JS_ORDER)

    # </script> がJS文字列中にあるとHTMLが途中で閉じてしまうため、念のため分断する
    js = js.replace('</script>', '<\\/script>')

    parts = []
    parts.append('<title>出納管理 ｜ 保護者会 出納帳</title>')
    parts.append('<style>\n%s\n</style>' % css)
    parts.append(body)
    parts.append(
        '<script>\n'
        '/* claude.ai で公開したページでは、外部通信と .xlsx 保存ができない。 */\n'
        'window.CASHBOOK_HOST = { name: "artifact", ai: false, xlsx: false, sync: false };\n'
        '</script>'
    )
    parts.append('<script>\n%s\n</script>' % js)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(parts) + '\n')

    size = os.path.getsize(OUT)
    print('saved:', OUT, f'{size:,} bytes')

    # 取りこぼしチェック。<header> を <head> と誤検出しないよう、タグ名で厳密に見る。
    text = open(OUT, encoding='utf-8').read()
    for tag in ('html', 'head', 'body'):
        assert not re.search(r'</?%s(\s|>)' % tag, text, re.I), \
            'Artifact では書かない要素が残っている: <%s>' % tag
    assert '<!DOCTYPE' not in text.upper(), 'DOCTYPE が残っている'
    for bad in ('src="js/', 'src="data/', 'href="css/', 'href="manifest'):
        assert bad not in text, '外部ファイル参照が残っている: ' + bad
    # 各ファイルから1つずつ、そこにしかない文字列で取り込みを確認する
    for label, need in [('ledger.js', 'window.LEDGER_SEED'), ('auth.js', 'DEVICE_KEY'),
                        ('xlsx.js', 'function crc32'),
                        ('pdf.js', 'global.PDFOut'),
                        ('store.js', 'cashbook.data.v1'), ('ocr.js', 'api.anthropic.com'),
                        ('app.js', 'function renderDash'), ('画面', 'id="view-report"'),
                        ('CSS', '--brand-2'), ('環境設定', 'window.CASHBOOK_HOST')]:
        assert need in text, '取り込めていない: ' + label
    print('OK: 単一ファイルとして整合')


if __name__ == '__main__':
    # 使い方:
    #   python3 tools/build_artifact.py                    … data/ledger.js を使う
    #   python3 tools/build_artifact.py --data 出納帳.json … そのJSONを埋め込む
    arg = None
    if len(sys.argv) >= 3 and sys.argv[1] == '--data':
        arg = sys.argv[2]
    elif len(sys.argv) == 2 and sys.argv[1] not in ('-h', '--help'):
        arg = sys.argv[1]
    main(arg)
