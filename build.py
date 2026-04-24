import os

def build():
    print("Starting build process...")
    
    # 1. 各ファイルを読み込む
    try:
        with open('src/index.html', 'r', encoding='utf-8') as f:
            html_content = f.read()
        with open('src/style.css', 'r', encoding='utf-8') as f:
            css_content = f.read()
        with open('src/script.js', 'r', encoding='utf-8') as f:
            js_content = f.read()
    except FileNotFoundError as e:
        print(f"Error: {e}")
        print("Ensure you have src/index.html, src/style.css, and src/script.js")
        return

    # 2. CSSをインライン化
    css_tag = f"<style>\n{css_content}\n</style>"
    html_content = html_content.replace('<link rel="stylesheet" href="style.css">', css_tag)

    # 3. JSをインライン化
    js_tag = f"<script>\n{js_content}\n</script>"
    html_content = html_content.replace('<script src="script.js"></script>', js_tag)

    # 4. ルートディレクトリに index.html を書き出す
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(html_content)

    print("Build successful! The single-file index.html has been generated at the root.")

if __name__ == "__main__":
    build()