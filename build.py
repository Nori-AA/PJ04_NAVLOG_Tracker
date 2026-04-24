import os

def build():
    print("Starting build process...")
    
    # パスの確認（デバッグ用）
    print(f"Current working directory: {os.getcwd()}")
    
    try:
        with open('src/index.html', 'r', encoding='utf-8') as f:
            html_content = f.read()
        with open('src/style.css', 'r', encoding='utf-8') as f:
            css_content = f.read()
        with open('src/script.js', 'r', encoding='utf-8') as f:
            js_content = f.read()
    except FileNotFoundError as e:
        print(f"Error: {e}")
        return

    # CSSの埋め込み
    # linkタグを丸ごとstyleタグに差し替える
    css_tag = f"<style>\n{css_content}\n</style>"
    if '<link rel="stylesheet" href="style.css">' in html_content:
        html_content = html_content.replace('<link rel="stylesheet" href="style.css">', css_tag)
        print("CSS successfully inlined.")
    else:
        print("Warning: CSS link tag not found in index.html")

    # JSの埋め込み
    js_tag = f"<script>\n{js_content}\n</script>"
    if '<script src="script.js"></script>' in html_content:
        html_content = html_content.replace('<script src="script.js"></script>', js_tag)
        print("JS successfully inlined.")
    else:
        print("Warning: JS script tag not found in index.html")

    # index.htmlを上書き保存
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(html_content)

    print("Build finished: index.html generated.")

if __name__ == "__main__":
    build()