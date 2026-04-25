import os
import re

def build():
    # 実行場所（カレントディレクトリ）に左右されないよう、ファイルの場所を特定
    base_dir = os.path.dirname(os.path.abspath(__file__))
    src_dir = os.path.join(base_dir, 'src')
    
    print(f"--- Starting Build V26.0.0 (Dynamic Multi-file) ---")

    # 1. まずはベースとなる HTML だけを読み込む
    try:
        with open(os.path.join(src_dir, 'index.html'), 'r', encoding='utf-8') as f:
            html = f.read()
        print(f"Read OK: HTML({len(html)} chars)")
    except Exception as e:
        print(f"CRITICAL ERROR (HTML Read Failed): {e}")
        return

    # 2. CSSの動的置換 (HTML内の <link href="ファイル名"> を探して合体)
    def replace_css(match):
        filename = match.group(1) # style.css などを取得
        try:
            with open(os.path.join(src_dir, filename), 'r', encoding='utf-8') as f:
                content = f.read()
            print(f"  -> Inlined CSS: {filename}")
            return f"<style>\n{content}\n</style>"
        except Exception as e:
            print(f"  -> ERROR: {filename} not found! ({e})")
            return match.group(0)

    css_pattern = r'<link[^>]*href=["\']([^"\']+\.css)["\'][^>]*>'
    html = re.sub(css_pattern, replace_css, html)

    # 3. JSの動的置換 (HTML内の <script src="ファイル名"> を探して合体)
    def replace_js(match):
        filename = match.group(1) # script.js や main.js などを取得
        try:
            with open(os.path.join(src_dir, filename), 'r', encoding='utf-8') as f:
                content = f.read()
            print(f"  -> Inlined JS: {filename}")
            return f"<script>\n{content}\n</script>"
        except Exception as e:
            print(f"  -> ERROR: {filename} not found! ({e})")
            return match.group(0)

    js_pattern = r'<script[^>]*src=["\']([^"\']+\.js)["\'][^>]*></script>'
    new_html = re.sub(js_pattern, replace_js, html)

    # 4. 書き出し（ルート直下の index.html）
    output_path = os.path.join(base_dir, 'index.html')
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(new_html)
        
        size = os.path.getsize(output_path)
        print(f"SUCCESS: index.html generated at {output_path}")
        print(f"Final File Size: {size} bytes")
            
    except Exception as e:
        print(f"CRITICAL ERROR (Write Failed): {e}")

if __name__ == "__main__":
    build()