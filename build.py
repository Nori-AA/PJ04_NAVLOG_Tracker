import os
import re

def build():
    # 実行場所（カレントディレクトリ）に左右されないよう、ファイルの場所を特定
    base_dir = os.path.dirname(os.path.abspath(__file__))
    src_dir = os.path.join(base_dir, 'src')
    
    print(f"--- Starting Build V25.2.5 ---")

    # 1. 各ファイルを読み込む
    try:
        with open(os.path.join(src_dir, 'index.html'), 'r', encoding='utf-8') as f:
            html = f.read()
        with open(os.path.join(src_dir, 'style.css'), 'r', encoding='utf-8') as f:
            css = f.read()
        with open(os.path.join(src_dir, 'script.js'), 'r', encoding='utf-8') as f:
            js = f.read()
        print(f"Read OK: HTML({len(html)} chars), CSS({len(css)}), JS({len(js)})")
    except Exception as e:
        print(f"CRITICAL ERROR (Read Failed): {e}")
        return

    # 2. CSSの置換 (lambdaを使ってPythonの勘違いを防止)
    css_pattern = r'<link[^>]*href=["\']style\.css["\'][^>]*>'
    css_replacement = f"<style>\n{css}\n</style>"
    new_html = re.sub(css_pattern, lambda m: css_replacement, html)

    # 3. JSの置換 (lambdaを使ってPythonの勘違いを防止)
    js_pattern = r'<script[^>]*src=["\']script\.js["\'][^>]*></script>'
    js_replacement = f"<script>\n{js}\n</script>"
    new_html = re.sub(js_pattern, lambda m: js_replacement, new_html)

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