# Builds public/guide.html (rules guide + FAQ) from the guide script and the FAQ list.
# Usage: python3 tools/build_guide.py tools/讲解稿.md public/guide.html tools/faq.json
# 讲解稿.md: one section per "## title", bullets as points.
import re, html, sys, json
src, out, faq_src = sys.argv[1], sys.argv[2], sys.argv[3]
from urllib.parse import quote
# FAQ sources: the official English wiki and the Chinese publisher's wiki (集石钟楼百科); ref = page name.
SRC = {
    'wiki': ('官方 Wiki', lambda p: 'https://wiki.bloodontheclocktower.com/' + quote(p.replace(' ', '_'))),
    'baike': ('集石钟楼百科', lambda p: 'https://clocktower-wiki.gstonegames.com/index.php?title=' + quote(p)),
}
faq = json.load(open(faq_src))
cats = list(dict.fromkeys(f['cat'] for f in faq))
faq_html = ''.join(f'<h3 class="fq-cat">{html.escape(c)}</h3>' + ''.join(
    f'<details class="card fq"><summary>{html.escape(f["q"])}</summary><p>{html.escape(f["a"])} <a href="{SRC[f["src"]][1](f["ref"].split("、")[0])}" target="_blank" rel="noopener">来源：{SRC[f["src"]][0]}「{html.escape(f["ref"])}」</a></p></details>'
    for f in faq if f['cat'] == c) for c in cats)
secs = re.findall(r'^## (.+?)\n(.*?)(?=^## |\Z)', open(src).read(), re.M | re.S)
toc = '<a class="fqa" href="#faq">常见问题</a>' + ''.join(f'<a href="#s{i}">{html.escape(t)}</a>' for i, (t, _) in enumerate(secs, 1))
body = ''
for i, (t, b) in enumerate(secs, 1):
    pts = ''.join(f'<li>{html.escape(x)}</li>' for x in re.findall(r'^- (.+)$', b, re.M))
    body += f'''<section class="card gs" id="s{i}"><h2 class="h"><span><i>{i:02d}</i>{html.escape(t)}</span></h2><ul>{pts}</ul></section>\n'''
open(out, 'w').write(f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0d0809">
<title>规则介绍 · 血染钟楼助手</title>
<meta property="og:title" content="规则介绍 · 血染钟楼助手">
<meta property="og:image" content="https://botc.leisurecat.cloud/img/icon-512.jpg">
<link rel="icon" href="img/icon-64.png">
<link rel="apple-touch-icon" href="img/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Noto+Serif+SC:wght@600;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="back-nav" data-html2canvas-ignore><a class="back-pill" href="/">‹ 返回</a></div>
<div style="position:absolute;width:0;height:0;overflow:hidden"><img src="img/icon-512.jpg" alt=""></div>
<div class="hero-art" style="height:calc(env(safe-area-inset-top) + 190px)"><img src="img/guide.jpg" alt="" style="object-position:50% 50%"><div class="ht"><div class="hz">规则介绍</div><div class="hs">血染钟楼 · 基础规则</div></div></div>
<div class="wrap guide">
<p class="note">依据集石钟楼百科（中文规则书正文）和官方英文 Wiki 整理，用自己的话概括，每条后面标了出处。这一页不含任何对局信息，玩家和说书人都可以看。</p>
<h2 class="h"><span>规则讲解</span><small>{len(secs)} 节</small></h2>
<nav class="toc">{toc}</nav>
{body}<h2 class="h" id="faq"><span>常见问题</span><small>{len(faq)} 条</small></h2>
<p class="note">点开查看答案，每条都附了出处。规则没写清楚的角色互动，一律以本局说书人的裁定为准。</p>
{faq_html}
<a class="btn" href="./">返回首页</a>
<a class="btn ghost" href="roles">三个剧本的角色表</a>
<footer>非官方玩家工具，与 The Pandemonium Institute、集石无关 · 规则依据官方 Wiki 与集石钟楼百科，文字为本站自写</footer>
</div>
<script type="module" src="chat.js"></script>
</body>
</html>
''')
print(len(secs), len(faq))
