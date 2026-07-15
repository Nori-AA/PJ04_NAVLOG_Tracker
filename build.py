import os
import re

def build():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    src_dir = os.path.join(base_dir, 'src')
    
    print(f"--- Building Single-File PWA index.html ---")

    # 1. HTMLの読み込み
    with open(os.path.join(src_dir, 'index.html'), 'r', encoding='utf-8') as f:
        html = f.read()

    # 2. CSSの置換 (style.css等をinline化)
    css_pattern = r'<link[^>]*href=["\']([^"\']+\.css)["\'][^>]*>'
    def replace_css(match):
        filename = match.group(1)
        with open(os.path.join(src_dir, filename), 'r', encoding='utf-8') as f:
            return f"<style>\n{f.read()}\n</style>"
    html = re.sub(css_pattern, replace_css, html)

    # 3. 外部scriptタグの除去（中身を統合するため一旦全て消す）
    html = re.sub(r'<script[^>]*src=["\'][^"\']+\.js["\'][^>]*></script>', '', html)

    # 4. JSの統合 (依存関係順)
    # script.js を必ず一番最初にする！
    js_files = ['script.js', 'utils.js', 'fuel.js', 'history.js', 'crew.js', 'parser.js']
    combined_js = ""
    for filename in js_files:
        try:
            with open(os.path.join(src_dir, filename), 'r', encoding='utf-8') as f:
                # ★ 方針変更: serviceWorker登録コードの削除処理(re.sub)はここで行わない
                combined_js += f"\n/* --- {filename} --- */\n{f.read()}"
            print(f"  Merged: {filename}")
        except Exception as e:
            print(f"  Warning: {filename} skipped ({e})")

    # 5. </body>直前にマージしたJSを注入
    new_html = html.replace('</body>', f'<script>\n{combined_js}\n</script>\n</body>')

    # 6. ルートディレクトリに書き出し
    output_path = os.path.join(base_dir, 'index.html')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(new_html)
    
    print(f"SUCCESS: PWA-ready index.html generated.")

if __name__ == "__main__":
    build()