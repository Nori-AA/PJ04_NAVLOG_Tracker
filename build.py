import os
import re

def build():
    print("--- Build Process Started ---")
    
    try:
        # src内のファイルを読み込む
        with open('src/index.html', 'r', encoding='utf-8') as f:
            html = f.read()
        with open('src/style.css', 'r', encoding='utf-8') as f:
            css = f.read()
        with open('src/script.js', 'r', encoding='utf-8') as f:
            js = f.read()
        
        print(f"Read OK: HTML({len(html)} chars), CSS({len(css)}), JS({len(js)})")

    except FileNotFoundError as e:
        print(f"CRITICAL ERROR: {e}")
        return

    # CSS置換
    css_pattern = r'<link.*href=["\']style\.css["\'].*>'
    css_replacement = f"<style>\n{css}\n</style>"
    new_html = re.sub(css_pattern, css_replacement, html)

    # JS置換
    js_pattern = r'<script.*src=["\']script\.js["\'].*></script>'
    js_replacement = f"<script>\n{js}\n</script>"
    new_html = re.sub(js_pattern, js_replacement, new_html)

    # 最終チェック: 置換が1回も行われなかったら警告
    if new_html == html:
        print("WARNING: No replacements were made. Check the tags in src/index.html")

    # 書き出し
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_html)
    
    # 書き出し後のファイルサイズ確認
    size = os.path.getsize('index.html')
    print(f"SUCCESS: index.html generated. Size: {size} bytes")

if __name__ == "__main__":
    build()