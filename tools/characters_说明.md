# characters.json 数据说明

整理日期：2026-11-04。范围：暗流涌动 / 黯月初升 / 梦殒春宵三个基础剧本的全部镇民、外来者、爪牙、恶魔（不含旅行者、传奇角色、实验性角色）。

| 剧本 | 镇民 | 外来者 | 爪牙 | 恶魔 | 合计 |
|---|---|---|---|---|---|
| 暗流涌动 tb | 13 | 4 | 4 | 1 | 22 |
| 黯月初升 bmr | 13 | 4 | 4 | 4 | 25 |
| 梦殒春宵 snv | 13 | 4 | 4 | 4 | 25 |

数量与官方 `roles.json` 一致，共 72 个角色。

## 数据来源

1. **官方开发者资源（主来源）**：GitHub `ThePandemoniumInstitute/botc-release`，main 分支
   - `resources/data/roles.json`：https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-release/main/resources/data/roles.json
   - `resources/data/nightsheet.json`：https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-release/main/resources/data/nightsheet.json（最后修改提交 3d6d930a9e，2026-05-11 "Include latest toolmaker data sheet changes"）
   - 仓库能正常读取，所以**没有用** clocktower.online 当替代来源。只拿 `bra1n/townsquare` 的 `src/roles.json` 和 `NightOrderModal.vue` 做夜序**对照**。
2. **官方英文 Wiki**：https://wiki.bloodontheclocktower.com/ 。网页直接访问会返回 418（拦截脚本），所以改用 MediaWiki API（`api.php?action=parse&prop=wikitext`）读取 72 个角色页，全部存在。我读了各页的 "How to Run"，用来写 `stFirst`/`stOther`。
3. **集石钟楼百科**：https://clocktower-wiki.gstonegames.com/ （通过其 `api.php` 读取）
   - 剧本页「暗流涌动」「黯月初升」「梦殒春宵」：中文剧本名、中文角色名、角色顺序与类型
   - 各角色页的「提示标记」一节：中文提醒标记名
   - 「夜晚行动顺序一览」页：夜序对照
4. **剧本别名**：集石百科里搜不到别名，改用网络搜索核对：
   - 灾祸滋生：机核 https://www.gcores.com/articles/149742 、B 站专栏等，称它是汉化前玩家对 Trouble Brewing 的叫法
   - 血月升起：游民星空攻略 https://www.gamersky.com/handbook/105638/List_3.html 等
   - 紫罗兰教派：同上，游民星空攻略

## 字段来源

| 字段 | 来源 |
|---|---|
| `id` / `en` / `edition` / `team` / `setup` | 官方 `roles.json` |
| `zh` | 集石剧本页（链接文字即角色页标题） |
| `firstNight` / `otherNight` | 官方 `nightsheet.json` 中的**位置序号**，从 1 开始，黄昏 = 1；不在列表中的角色记为 0。见下方「夜序编号说明」 |
| `reminders` / `remindersGlobal` | 以官方 `roles.json` 的英文 reminders 为准，**数量和顺序都照搬**（重复项表示实体标记有多枚，例如旅店老板有 2 枚“不会死亡”，杂耍艺人有 5 枚“猜测正确”）。每一项再换成集石角色页「提示标记」里的中文名。网站展示时如果只要种类，可以自行去重 |
| `gist` / `stFirst` / `stOther` | 自己写的。依据是官方能力、官方 Wiki 的 How to Run 和 `roles.json` 里的夜间提示，没有照抄官方英文或集石中文 |
| `setupNote` / `outsiderMod` | 官方能力文字末尾的方括号，例如 `[+2 Outsiders]`、`[-1 or +1 Outsider]`；酒鬼的说明按 Wiki 的 How to Run 写 |
| `src` | 官方 Wiki 角色页 URL，名字里的空格换成 `_`，例如 `Devil's_Advocate` 写成 `Devil%27s_Advocate` |

### 夜序编号说明

官方新版 `nightsheet.json` **不提供数字编号**，只给出 `firstNight` 和 `otherNight` 两个有序 id 列表，里面包含全部官方角色（含旅行者、实验角色），以及 `dusk`、`minioninfo`、`demoninfo`、`dawn` 四个步骤。本文件的序号就是角色在该列表里的位置，从 1 开始数：

- 黄昏 dusk：首夜 1 / 其他夜 1
- 爪牙信息 minioninfo：首夜 20 / 其他夜 0
- 恶魔信息 demoninfo：首夜 24 / 其他夜 0
- 黎明 dawn：首夜 78 / 其他夜 98
- 例：洗衣妇首夜 = 52

这些数字只用来排序，不是“第几个被唤醒”。任务示例里写的“洗衣妇 32”大概来自旧版 clocktower.online 的编号体系（那边是 33），两种体系的数字不能混用。官方列表以后如果插入新角色，序号会整体变化，需要重新生成。

## 夜序差异（只比较三个剧本内角色的先后顺序）

- **官方 nightsheet 与 townsquare roles.json**：首夜、其他夜晚的先后顺序**完全一致**，没有倒序。只是数字体系不同：townsquare 是旧编号，爪牙信息 = 5、恶魔信息 = 8，也没有黄昏和黎明步骤。
- **官方 nightsheet 与集石「夜晚行动顺序一览」**：
  - 首夜：基础剧本角色和四个步骤的顺序完全一致。
  - 其他夜晚：有 31 组先后关系不同，都是集石页面自己写明“调整理由”的推荐顺序。该页也说明，说书人可以按原顺序或推荐顺序来执行。主要差异有：
    1. **麻脸巫婆**：官方排在 洗脑师 之后、红唇女郎 之前；集石把她提到 投毒者、侍臣、旅店老板、赌徒、舞蛇人、僧侣、魔鬼代言人、女巫、洗脑师 之前（紧接水手之后）。理由是让她新造出的爪牙当晚就能行动。
    2. **旅店老板 / 侍臣**：官方是侍臣先、旅店老板后；集石是旅店老板先。
    3. **修补匠、月之子、祖母**：官方排在 理发师、心上人、贤者、教授 之后；集石把这三个“造成死亡”的结算提前到这些“死亡触发”能力之前。
    4. **守鸦人**：官方排在 贤者、教授 之后；集石排在它们之前。
    5. **管家**：官方排在 共情者 … 杂耍艺人 之后（间谍之前）；集石提到 占卜师 之后、送葬者 之前。

  本 JSON 一律使用**官方顺序**。

## 拿不准的地方

- 【待核实】别名“血月升起”和“紫罗兰教派”只找到攻略站和社区文章，集石百科没有收录。有搜索结果说“血月升起”也被用来指别的剧本。“灾祸滋生”的来源比较多，可信度较高。
- 【待核实】任务示例写的“亡骨魔 [1]、亡者 vigormortis [-1]”有混淆。官方数据是：**方古 Fang Gu = [+1 Outsider]**，**亡骨魔 Vigormortis = [-1 Outsider]**（集石中“亡骨魔”就是 Vigormortis）。JSON 按官方填写：fanggu `[1]`，vigormortis `[-1]`。
- 酒鬼：官方 `setup=true`，但它不改变外来者数量，所以 `outsiderMod=[0]`，`setupNote` 写的是“取一个不在场镇民标记给他”。
- 疯子：实际布置时要把疯子和恶魔标记对调，但官方 `setup=false`，所以照官方填 false，`setupNote` 留空。
- 疯子的提醒标记：集石页面还列了“是疯子”，并注明仅线上魔典有、实体版没有；官方 `roles.json` 不含这个标记，所以没有收录。
- 祖母、造谣者、修补匠、月之子、心上人在官方夜序里占位，但通常不需要唤醒本人，所以 `stOther` 写成“无需唤醒：…”，表示说书人在这个时机要做的结算。
- 教授的 “Alive” 标记，集石译作“复活”；沙巴洛斯的 “Alive” 也用了“复活”。

## 自检结果（生成脚本自动检查）

- 各剧本、各类型数量与官方 `roles.json` 一致（22 / 25 / 25）；id 不重复；72 个角色都有中文名。
- 每个角色的 `firstNight` / `otherNight` 都等于官方 nightsheet 中的位置序号。另外核对了“有夜间提示文字 ⇔ 在夜序列表中”，没有不一致。
- `reminders` 的数量与官方相同；所有中文标记名都能在集石对应角色页的「提示标记」中找到。
- `gist` 最长 39 个字。把每条 `gist` 与集石「角色能力」原文求最长公共子串，最长 8 个字，都是“他们不会死亡”“一名善良玩家”这类通用说法，没有整句雷同。`stFirst`/`stOther` 与集石「运作方式」的最长公共子串是 9 个字，例如“外来者的角色标记”。
