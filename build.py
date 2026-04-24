import os
import re

def build():
    print("--- Build Process Started ---")
    
    # 読み込み
    try:
        with open('src/index.html', 'r', encoding='utf-8') as f:
            html = f.read()
        with open('src/style.css', 'r', encoding='utf-8') as f:
            css = f.read()
        with open('src/script.js', 'r', encoding='utf-8') as f:
            js = f.read()
    except FileNotFoundError as e:
        print(f"ERROR: {e}")
        return

    # 【重要】CSSの置換 (linkタグをstyleタグに置換)
    # スペースや改行のズレに強い「正規表現」という方法で探します
    css_pattern = r'<link.*href=["\']style\.css["\'].*>'
    css_replacement = f"<style>\n{css} \n</style>"
    html = re.sub(css_pattern, css_replacement, html)

    # 【重要】JSの置換 (scriptタグを中身入りに置換)
    js_pattern = r'<script.*src=["\']script\.js["\'].*></script>'
    js_replacement = f"<script>\n{js} \n</script>"
    html = re.sub(js_pattern, js_replacement, html)

    # 書き出し（ルート直下の index.html へ）
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(html)
    
    print("SUCCESS: index.html has been generated.")

if __name__ == "__main__":
    build()