// 栏目大全 tv.cctv.cn/lm/index.shtml
// 栏目清单来自官方 columnSearch 接口（349 个栏目）。
// 节目列表走 NewVideo/getVideoListByColumn：先取栏目页里的 TOPC 编号，
// 再从该接口按发布时间倒序翻页，可直接取到往期节目（不再只有当天）。
// 音频取国家台 HTTP 视频接口里的纯音频流。
(function () {
  var SITE = 'https://tv.cctv.cn/lm/index.shtml';
  var API = 'https://zy.api.cntv.cn/lanmu/columnSearch';
  var LIST_API = 'https://api.cntv.cn/NewVideo/getVideoListByColumn';
  var VDN_API = 'https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid=';
  var REFERER = 'https://tv.cctv.com/';
  var CACHE_KEY = 'cctv-lm-columns';
  var CACHE_MS = 6 * 60 * 60 * 1000;
  var PAGE_SIZE = 100;
  var EPS_PAGE = 100;     // 接口单页条数
  var EPS_PAGES = 10;     // 最多拉几页（接口总量上限约 1000 条）

  function after(url, prefix) {
    if (url.indexOf(prefix) !== 0) throw new Error('无法识别的地址');
    return url.substring(prefix.length);
  }

  function fetchPage(host, page) {
    var url = API + '?&fl=&fc=&cid=&p=' + page + '&n=' + PAGE_SIZE +
      '&serviceId=tvcctv&t=jsonp&cb=cb';
    var data = host.getJson(url, { headers: { Referer: SITE } });
    var response = at(data, 'response');
    return {
      docs: items(response, 'docs'),
      total: Number(str(response, 'numFound')) || 0
    };
  }

  // 栏目封面：栏目自带的封面是 16:9 横版海报，放进竖版卡片位会被裁掉。
  // 不改原图、也不换成台标，只让图片处理服务按 360×480 白底竖版等比装进画布，
  // 整张海报完整可见（上下留白），不再被裁。
  var RESIZE = 'https://images.weserv.nl/?url=';
  // 预转好的 360×480 白底竖版栏目封面（data/columns.json 是 id -> 栏目信息 的清单）
  var REPO = 'https://cdn.jsdelivr.net/gh/jackycher/tv-covers@main/';
  var MANIFEST_KEY = 'cctv-lm-covers';

  function fill(url) {
    if (!url) return '';
    return RESIZE + encodeURIComponent(url) +
      '&w=360&h=480&fit=contain&bg=white&output=png';
  }

  // 仓库清单（缓存 6 小时）：命中就用预转封面，没命中（刚上线的新栏目）回退实时适配
  function loadManifest(host) {
    var age = host.cacheAge(MANIFEST_KEY);
    if (age >= 0 && age < CACHE_MS) {
      var cached = host.readCache(MANIFEST_KEY);
      if (cached) { try { var got = parseJson(cached); if (got) return got; } catch (e) { } }
    }
    var map = {};
    try { map = host.getJson(REPO + 'data/columns.json') || {}; } catch (e) { map = {}; }
    if (map && typeof map === 'object') host.writeCache(MANIFEST_KEY, JSON.stringify(map));
    return map || {};
  }

  function coverOf(id, logo, covers) {
    var hit = covers && covers[id];
    if (hit && hit.cover !== false) return REPO + 'column/' + id + '.jpg';
    return fill(logo);
  }

  function slim(row) {
    var latest = at(row, 'lastVIDE') || {};
    var channel = str(row, 'channel_name');
    return {
      id: str(row, 'column_id'),
      name: str(row, 'column_name'),
      channel: channel,
      website: str(row, 'column_website'),
      logo: str(row, 'column_logo'),
      cover: fill(str(row, 'column_logo')),
      brief: str(row, 'column_brief'),
      playdate: str(row, 'column_playdate'),
      latestTitle: str(latest, 'videoTitle'),
      latestUrl: str(latest, 'videoUrl')
    };
  }

  // 全量栏目（缓存 6 小时）
  function loadColumns(host) {
    var age = host.cacheAge(CACHE_KEY);
    if (age >= 0 && age < CACHE_MS) {
      var cached = host.readCache(CACHE_KEY);
      if (cached) {
        try {
          var parsed = parseJson(cached);
          if (parsed && parsed.length) return parsed;
        } catch (e) { /* 缓存损坏则重新拉取 */ }
      }
    }
    var out = [], page = 1, total = 0;
    var covers = loadManifest(host);
    try {
      for (page = 1; page <= 8; page++) {
        var res = fetchPage(host, page);
        total = res.total || total;
        for (var i = 0; i < res.docs.length; i++) {
          var row = slim(res.docs[i]);
          if (row.id && row.name) {
            row.cover = coverOf(row.id, row.logo, covers);
            out.push(row);
          }
        }
        host.progress(page + ' / ' + (Math.ceil(total / PAGE_SIZE) || 1));
        if (res.docs.length < PAGE_SIZE) break;
      }
    } finally {
      host.progress(null);
    }
    if (out.length) host.writeCache(CACHE_KEY, JSON.stringify(out));
    return out;
  }

  function findColumn(host, id) {
    var list = loadColumns(host);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // 频道排序：CH-1、CH-2、…、CH-17（按数字排，不按字符串，免得 1 后面跟 10）；
  // CH-5+ 排在 CH-5 之后，非 CH 频道（CGTN、卫视等）排在最后
  function channelRank(name) {
    var m = /CCTV[-－]?\s*(\d+)/i.exec(name || '');
    if (!m) return { n: 9999, plus: 0 };
    return { n: parseInt(m[1], 10), plus: (name.indexOf('+') >= 0 || name.indexOf('＋') >= 0) ? 1 : 0 };
  }

  function cmpChannel(a, b) {
    var ra = channelRank(a), rb = channelRank(b);
    if (ra.n !== rb.n) return ra.n - rb.n;
    if (ra.plus !== rb.plus) return ra.plus - rb.plus;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function channelTabs(list) {
    var names = [], seen = {};
    for (var i = 0; i < list.length; i++) {
      var c = list[i].channel;
      if (!c || seen[c]) continue;
      seen[c] = true;
      names.push(c);
    }
    names.sort(cmpChannel);
    return names;
  }

  // 栏目页里带着本栏目的 TOPC 编号，是节目列表接口的入参
  function topcOf(host, column) {
    var cacheKey = 'cctv-lm-topc-' + column.id;
    var age = host.cacheAge(cacheKey);
    if (age >= 0 && age < CACHE_MS) {
      var hit = host.readCache(cacheKey);
      if (hit) return hit;
    }
    var urls = [];
    if (column.website) {
      urls.push(column.website);
      if (/\/index\.shtml$/.test(column.website)) {
        urls.push(column.website.replace(/\/index\.shtml$/, '/videoset/index.shtml'));
      }
    }
    for (var i = 0; i < urls.length; i++) {
      var html = null;
      try {
        html = host.getString(urls[i], { headers: { Referer: SITE } });
      } catch (e) { html = null; }
      if (!html) continue;
      var m = /TOPC\d{8,}/.exec(html);
      if (m) {
        host.writeCache(cacheKey, m[0]);
        return m[0];
      }
    }
    return null;
  }

  function cleanTitle(title) {
    var t = (title || '').replace(/^\s*\[(?:视频|完整版|超清)\]\s*/, '');
    t = t.replace(/^完整版\[视频\]\s*/, '');
    return t || (title || '');
  }

  // 把原始标题里跟栏目名重复的部分、日期和时刻都去掉，只留下"这一期具体是什么"
  // 例：《正点财经》 20261122 16:00 → 空；《焦点访谈》 20261121 丰收里的"加减法" → 丰收里的"加减法"
  function restTitle(orig, name, title) {
    var t = cleanTitle(orig || '');
    var names = [], i;
    if (name) names.push(name);
    if (title && title !== name) names.push(title);
    for (i = 0; i < names.length; i++) {
      var n = names[i].replace(/^\s+|\s+$/g, '');
      if (!n) continue;
      t = t.split('《' + n + '》').join(' ');
      t = t.split('【' + n + '】').join(' ');
      t = t.split(n).join(' ');
    }
    t = t.replace(/20\d{2}[-/]?\d{2}[-/]?\d{2}/g, ' ');   // 20261122 / 2026-11-22
    t = t.replace(/\d{1,2}[：:]\d{2}/g, ' ');             // 16:00 / 16：00
    t = t.replace(/\s\d{4}\s*$/, ' ');                    // 结尾单独的 2100 / 1900
    t = t.replace(/\s+/g, ' ');
    return t.replace(/^[\s\-—·、]+|[\s\-—·、]+$/g, '');
  }

  // 一个栏目的一页节目
  function listEpisodes(host, topc, page, n) {
    var url = LIST_API + '?id=' + topc + '&n=' + n + '&sort=desc&p=' + page +
      '&mode=&serviceId=tvcctv';
    var data = host.getJson(url, { headers: { Referer: SITE } });
    var body = at(data, 'data') || {};
    return { list: items(body, 'list'), total: Number(str(body, 'total')) || 0 };
  }

  // 栏目官网兜底：抓页面里的节目链接（通常只有最新一天）
  function pageEpisodes(host, column) {
    if (!column.website) return [];
    var html = host.getString(column.website, { headers: { Referer: SITE } });
    var doc = host.parseHtml(html, column.website);
    var list = [], seen = {};
    doc.select('a').forEach(function (a) {
      var href = a.absUrl('href');
      if (!href || !/\/\d{4}\/\d{2}\/\d{2}\/VID[A-Za-z0-9]+\.shtml/.test(href)) return;
      if (seen[href]) return;
      var title = a.text();
      if (!title || title.length < 2) return;
      seen[href] = true;
      list.push({ title: cleanTitle(title), url: href });
    });
    return list;
  }

  // 整期节目：标题带栏目名（如「《新闻联播》 20261121 21:00」）；
  // 只认整期，不按日期去重，免得《正点财经》这类一天多档的栏目被削掉
  function fullEpisodes(rows, column) {
    var named = [], key = '《' + column.name + '》', i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].title.indexOf(key) >= 0) named.push(rows[i]);
    }
    return named;
  }

  // 去掉晚间重播：同一天、同一档节目（去掉结尾时刻后标题相同）如果同时存在白天档和
  // 21:00 以后的档，说明晚间那条是重播，丢掉；只剩白天多档（如《正点财经》）时保持原样。
  // 播出时刻：优先按标题里的时间（如「《正点财经》 20261122 10:00」），
  // 标题里没有再用接口的 time 字段。取最后一处，避免把「20261122」里的数字当时间。
  function timeOf(timeText, title) {
    var re = /(\d{1,2})[：:](\d{2})/g, m, last = '';
    while ((m = re.exec(title || ''))) {
      last = (m[1].length < 2 ? '0' + m[1] : m[1]) + ':' + m[2];
    }
    if (last) return last;
    re = /(\d{1,2}):(\d{2})/;
    m = re.exec(timeText || '');
    return m ? (m[1].length < 2 ? '0' + m[1] : m[1]) + ':' + m[2] : '';
  }

  function dropReruns(rows) {
    var i, t, hm, base;
    var dayOk = {};   // base -> true 表示这一天该节目已有 21 点前的档
    for (i = 0; i < rows.length; i++) {
      hm = rows[i].hm || /\d{2}:\d{2}$/.exec(rows[i].title || '');
      if (typeof hm !== 'string') hm = hm ? hm[0] : '';
      base = (rows[i].orig || rows[i].title || '').replace(/\s*\d{1,2}[：:]\d{2}$/, '');
      if (hm && hm < '21:00') dayOk[base] = true;
    }
    var kept = [];
    for (i = 0; i < rows.length; i++) {
      hm = rows[i].hm || /\d{2}:\d{2}$/.exec(rows[i].title || '');
      if (typeof hm !== 'string') hm = hm ? hm[0] : '';
      base = (rows[i].orig || rows[i].title || '').replace(/\s*\d{1,2}[：:]\d{2}$/, '');
      if (hm && hm >= '21:00' && dayOk[base]) continue;
      kept.push(rows[i]);
    }
    return kept;
  }

  function episodesToRows(host, column, loadFullPages) {    var topc = topcOf(host, column);
    if (!topc) return pageEpisodes(host, column);
    // 逐页拉，凑够整期就停：这样即使接口里混着大量单条新闻，也不会只剩一两天
    var target = loadFullPages ? 200 : 45;
    var rows = [], seen = {}, i, j, named = [];
    for (i = 1; i <= EPS_PAGES; i++) {
      var res = null;
      try {
        res = listEpisodes(host, topc, i, EPS_PAGE);
      } catch (e) {
        if (i === 1) return pageEpisodes(host, column);
        break;
      }
      host.progress(i + ' / ' + EPS_PAGES);
      for (j = 0; j < res.list.length; j++) {
        var v = res.list[j];
        var guid = str(v, 'guid'), id = str(v, 'id');
        if (!guid && !id) continue;
        var key = guid || id;
        if (seen[key]) continue;
        seen[key] = true;
        var orig = cleanTitle(str(v, 'title'));
        rows.push({
          title: str(v, 'time').substring(0, 10) + ' ' + orig,
          orig: orig,
          hm: timeOf(str(v, 'time'), orig),
          url: 'lm:vid:' + key,
          pageUrl: str(v, 'url'),
          sortKey: str(v, 'time')
        });
      }
      named = fullEpisodes(rows, column);
      if (named.length >= target || res.list.length < EPS_PAGE) break;
    }
    host.progress(null);
    if (!rows.length) return pageEpisodes(host, column);
    // 接口返回的时间顺序并不严格，先按播出时间倒序排好，列表才看得下去
    rows.sort(function (a, b) {
      if (a.sortKey === b.sortKey) return 0;
      return a.sortKey < b.sortKey ? 1 : -1;
    });
    // 同一天同一档节目，21 点以后的多是重播（如《新闻联播》19:00 与 21:00），只留首播那一条；
    // 白天的多档栏目（如《正点财经》一天多期）不受影响。
    rows = dropReruns(rows);
    // 同一天、同一时刻、同一档节目出现两条的（接口里重复录入），只留一条
    var uniq = {}, deduped = [];
    for (var u = 0; u < rows.length; u++) {
      var ukey = (rows[u].sortKey || '').substring(0, 10) + '|' + (rows[u].hm || '') + '|' +
        (rows[u].orig || '').replace(/\s+/g, '');
      if (uniq[ukey]) continue;
      uniq[ukey] = true;
      deduped.push(rows[u]);
    }
    rows = deduped;

    if (named.length >= 2) return fullEpisodes(rows, column);
    return rows;
  }

  // 某一天这个栏目下的全部视频：完整版 + 拆开的每一条，按播出顺序
  function daySegments(host, topc, column, day) {
    var segs = [], seen = {}, i;
    var url = LIST_API + '?id=' + topc + '&n=100&sort=asc&p=1&mode=2&d=' +
      day.replace(/-/g, '') + '&serviceId=tvcctv';
    var data;
    try {
      data = host.getJson(url, { headers: { Referer: SITE } });
    } catch (e) {
      return segs;
    }
    var list = items(at(data, 'data') || {}, 'list');
    var fullKey = '《' + column.name + '》';
    for (i = 0; i < list.length; i++) {
      var v = list[i];
      var guid = str(v, 'guid') || str(v, 'id');
      var title = str(v, 'title').replace(/^\[视频\]\s*/, '').replace(/^\s+|\s+$/g, '');
      if (!guid || !title || seen[guid]) continue;
      if (str(v, 'length') === '00:00:00') continue;
      // 完整版本身、或者不属于这一天的，跳过
      if (title.indexOf(fullKey) >= 0) continue;
      var m = /(20\d{2})-?(\d{2})-?(\d{2})/.exec(title);
      if (m && (m[1] + '-' + m[2] + '-' + m[3]) !== day) continue;
      seen[guid] = true;
      segs.push({ title: '· ' + title, url: 'lm:vid:' + guid });
    }
    return segs;
  }

  function bookOf(row) {
    return {
      title: row.name,
      bookUrl: 'lm:col:' + row.id,
      coverUrl: row.cover || row.logo || '',
      author: row.channel || '',
      intro: row.brief || ''
    };
  }

  registerSource({
    id: 'f5b8a2c4d6e04719b3a5c7d9e1f2a4b6',
    name: '栏目大全',
    url: SITE,
    group: '听书',
    description: '栏目大全：349 个国家台栏目，按频道浏览，可翻到往期节目，取国家台官方音频流',

    search: function (keywords, page) {
      var kw = (keywords || '').toLowerCase();
      if (!kw || (page && Number(page) > 1)) return { books: [], totalPage: 1 };
      var list = loadColumns(this.host), books = [];
      for (var i = 0; i < list.length; i++) {
        var row = list[i];
        var hay = (row.name + ' ' + row.channel + ' ' + row.brief).toLowerCase();
        if (hay.indexOf(kw) >= 0) books.push(bookOf(row));
      }
      return { books: books, totalPage: 1 };
    },

    categoryMenus: function () {
      var list = loadColumns(this.host);
      var tabs = [{ title: '全部栏目', url: 'lm:all:1' }];
      var names = channelTabs(list);
      for (var i = 0; i < names.length; i++) {
        tabs.push({ title: names[i], url: 'lm:ch:' + names[i] + ':1' });
      }
      return [{ title: '栏目大全', tabs: tabs }];
    },

    categoryPage: function (url) {
      var list = loadColumns(this.host);
      var isAll = url.indexOf('lm:all') === 0;
      var channel = '', page = 1;
      if (isAll) {
        page = Number(after(url, 'lm:all:')) || 1;
      } else {
        var rest = after(url, 'lm:ch:');
        var cut = rest.lastIndexOf(':');
        channel = cut > 0 ? rest.substring(0, cut) : rest;
        page = cut > 0 ? (Number(rest.substring(cut + 1)) || 1) : 1;
      }
      var rows = [];
      for (var i = 0; i < list.length; i++) {
        if (channel && list[i].channel !== channel) continue;
        rows.push(list[i]);
      }
      // 「全部栏目」也按频道号排：CH-1、CH-2 … CH-17
      if (isAll) rows.sort(function (a, b) { return cmpChannel(a.channel, b.channel); });
      var start = (page - 1) * 20;
      var books = rows.slice(start, start + 20).map(bookOf);
      var hasNext = start + 20 < rows.length;
      return {
        books: books,
        currentPage: page,
        totalPage: Math.max(1, Math.ceil(rows.length / 20)),
        nextUrl: hasNext
          ? (isAll ? 'lm:all:' + (page + 1) : 'lm:ch:' + channel + ':' + (page + 1))
          : null
      };
    },

    bookDetail: function (url, loadEpisodes, loadFullPages) {
      var host = this.host;
      var column = findColumn(host, after(url, 'lm:col:'));
      if (!column) throw new Error('栏目不在当前栏目表中');
      var detail = {
        title: column.name,
        coverUrl: column.cover || column.logo || '',
        author: column.channel || '',
        intro: [
          column.brief || '',
          column.channel ? '播出频道：' + column.channel : '',
          column.playdate ? '播出时间：' + column.playdate : '',
          '栏目官网：' + (column.website || '')
        ].join('\n'),
        episodes: []
      };
      if (!loadEpisodes) return detail;
      var rows = episodesToRows(host, column, loadFullPages);
      var topc = topcOf(host, column);
      // 刚打开时只给最近几天拆分，后台全量加载时再多拆几天，免得一上来就发几十个请求
      var segDays = loadFullPages ? 20 : 3;
      var splitDays = {}, splitCount = 0;
      for (var d = 0; d < rows.length; d++) {
        var day = rows[d].sortKey ? rows[d].sortKey.substring(0, 10) : (rows[d].title || '').substring(0, 10);
        var hm = rows[d].hm || '';
        var extra = restTitle(rows[d].orig || '', column.name, column.title);
        detail.episodes.push({
          title: '《' + (column.name || column.title || '') + '》 ' + day + (hm ? ' ' + hm : '') +
            (extra ? ' ' + extra : '') + ' [完整版]',
          url: rows[d].url
        });
        if (!topc || splitDays[day] || splitCount >= segDays) continue;
        splitDays[day] = true;
        splitCount++;
        var segs = daySegments(host, topc, column, day);
        for (var k = 0; k < segs.length; k++) {
          detail.episodes.push({ title: day + ' ' + segs[k].title, url: segs[k].url });
        }
        host.progress('拆分 ' + splitCount + ' / ' + segDays);
      }
      host.progress(null);
      if (detail.episodes.length) {
        detail.status = '完整版 ' + rows.length + ' 期，最近 ' + splitCount + ' 天含具体节目';
      }
      return detail;
    },

    audio: function (url) {
      var host = this.host;
      var guid = null;

      // 节目列表直接给的就是国家台的视频 id（部分接口是 guid）
      if (url.indexOf('lm:vid:') === 0) guid = url.substring(7);
      if (!guid) {
        var html = host.getString(url, { headers: { Referer: SITE } });
        var m = /guid\s*[:=]\s*"([0-9a-zA-Z]{20,40})"/.exec(html);
        guid = m ? m[1] : null;
      }
      if (!guid) throw new Error('未在节目页找到节目标识');

      var info = host.getJson(VDN_API + encodeURIComponent(guid), {
        headers: { Referer: REFERER }
      });
      var tip = str(info, 'tip_msg') || '该节目暂无可用音频';

      // 国家台的 audio_mp3 是个 HLS 主清单，里面只有一行（如 "32.mp3"）指向整段 MP3 文件。
      // 直接把主清单当 HLS 交给播放器会解析失败，所以这里自己取一次清单，取出那一段真实的 MP3 直接播。
      var mp3List = str(info, 'manifest.audio_mp3');
      if (/^https?:\/\//.test(mp3List)) {
        var body = '', ok = true;
        try { body = host.getString(mp3List, { headers: { Referer: REFERER } }); } catch (e) { ok = false; }
        if (ok && body) {
          var lines = body.split(/\r?\n/), target = '';
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].replace(/^\s+|\s+$/g, '');
            if (line && line.charAt(0) !== '#') { target = line; break; }
          }
          if (target) {
            var full = /^https?:\/\//.test(target) ? target : mp3List.substring(0, mp3List.lastIndexOf('/') + 1) + target;
            // 整段 MP3（.mp3）直接当普通音频播，不要再按 HLS 解析
            if (/\.mp3(\?|$)/i.test(full)) return { url: full, headers: { Referer: REFERER } };
            if (/\.m3u8(\?|$)/i.test(full)) return { url: full, headers: { Referer: REFERER, 'X-Media-Type': 'hls' } };
          }
        }
      }

      // 退路：国家台给的纯音频 HLS 优先（hls_audio_url 是纯音频，比整段视频省流量），再不行用音视频 HLS
      var hls = str(info, 'manifest.hls_audio_url') || str(info, 'hls_url');
      if (/^https?:\/\//.test(hls)) return { url: hls, headers: { Referer: REFERER, 'X-Media-Type': 'hls' } };
      throw new Error(tip);
    }
  });
})();
