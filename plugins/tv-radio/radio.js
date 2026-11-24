// 电台直播源 fanmingming/live radio/m3u/fm.m3u —— 只保留「电视伴音」分组
// 这一组都是央视/卫视直播的纯音频地址（m3u8 直链），可以直接播放。
// 列表与台标：m3u 走 jsDelivr 镜像（GitHub 原站在国内经常连不上）；
//   CCTV 各频道台标用 whykan/ssxz 的 cctv-icons（gitee 直链，快且稳），
//   其余台标用 fanmingming 仓库 tv 目录（jsDelivr 镜像）。
// 节目单：央视 EPG epginfo3，一次请求拿多台，含 isLive 与当天每档节目的 st/et，
//   列表里显示「正在播」，详情里给出带 ▶ 的当日完整节目单。
(function () {
  var M3U_URL = 'https://cdn.jsdelivr.net/gh/fanmingming/live/radio/m3u/fm.m3u';
  var M3U_BACKUP = 'https://raw.githubusercontent.com/fanmingming/live/refs/heads/main/radio/m3u/fm.m3u';
  var CACHE_KEY = 'radio-fm-tv-audio';
  var CACHE_MS = 6 * 60 * 60 * 1000;
  var KEEP_GROUP = '电视伴音';
  var PAGE = 40;

  var EPG_API = 'https://api.cntv.cn/epg/epginfo3';
  var EPG_REF = 'https://tv.cctv.com/live/';
  var PH_API = 'https://ne883dbn.ifeng.com/phtvperiodlist';
  var EPG_KEY = 'radio-epg3-';
  var EPG_MS = 5 * 60 * 1000;

  // 台标全部取 jackycher/tv-covers 仓库（360×480 白底竖版，jsDelivr 分发）：
  // cctv/ 下是搬运的 cctv-icons，satellite/ 下是卫视/CETV/凤凰已转好的竖版图
  var ICON_BASE = 'https://cdn.jsdelivr.net/gh/jackycher/tv-covers@main/cctv/';
  var LOGO_BASE = 'https://cdn.jsdelivr.net/gh/jackycher/tv-covers@main/satellite/';
  var GITEE_CODES = {
    cctv1: 1, cctv2: 1, cctv3: 1, cctv4: 1, cctv5: 1, cctv5plus: 1, cctv6: 1, cctv7: 1,
    cctv8: 1, cctvjilu: 1, cctv10: 1, cctv11: 1, cctv12: 1, cctv13: 1, cctvchild: 1,
    cctv15: 1, cctv16: 1, cctv17: 1, cctveurope: 1, cctvamerica: 1
  };

  // 卫视 / CETV / 凤凰：原图是 300×180 的透明横图，直接放进竖版卡片位会被裁切、
  // 文字挤在一起。这里不改原图、也不另存图片，而是交给图片处理服务实时改成
  // 360×480 白底竖版（等比装进画布，不裁不拉伸），效果与 CCTV 台标一致。
  var RESIZE = 'https://images.weserv.nl/?url=';

  function fill(url) {
    return RESIZE + encodeURIComponent(url) +
      '&w=360&h=480&fit=contain&bg=white&output=webp&q=72';
  }

  // 台名 -> 央视 EPG 频道代号（没有的台只显示直播，不显示节目单）
  var EPG_CODES = {
    'CCTV1': 'cctv1', 'CCTV2': 'cctv2', 'CCTV3': 'cctv3', 'CCTV4': 'cctv4',
    'CCTV5': 'cctv5', 'CCTV5+': 'cctv5plus', 'CCTV6': 'cctv6', 'CCTV7': 'cctv7',
    'CCTV8': 'cctv8', 'CCTV9': 'cctvjilu', 'CCTV10': 'cctv10', 'CCTV11': 'cctv11',
    'CCTV12': 'cctv12', 'CCTV13': 'cctv13', 'CCTV14': 'cctvchild', 'CCTV15': 'cctv15',
    'CCTV16': 'cctv16', 'CCTV17': 'cctv17',
    'CCTV4欧洲': 'cctveurope', 'CCTV4美洲': 'cctvamerica',
    'CETV1': 'cetv1', 'CETV2': 'cetv2', 'CETV3': 'cetv3', 'CETV4': 'cetv4',
    '湖南卫视': 'hunan', '东方卫视': 'dongfang', '浙江卫视': 'zhejiang', '江苏卫视': 'jiangsu',
    '北京卫视': 'btv1', '深圳卫视': 'shenzhen', '安徽卫视': 'anhui', '山东卫视': 'shandong',
    '东南卫视': 'dongnan', '广东卫视': 'guangdong', '四川卫视': 'sichuan', '天津卫视': 'tianjin',
    '重庆卫视': 'chongqing', '湖北卫视': 'hubei', '辽宁卫视': 'liaoning', '吉林卫视': 'jilin',
    '黑龙江卫视': 'heilongjiang', '河北卫视': 'hebei', '河南卫视': 'henan', '云南卫视': 'yunnan',
    '贵州卫视': 'guizhou', '甘肃卫视': 'gansu', '延边卫视': 'yanbian', '西藏卫视': 'xizang',
    '江西卫视': 'jiangxi', '宁夏卫视': 'ningxia', '青海卫视': 'qinghai', '内蒙古卫视': 'neimenggu',
    '新疆卫视': 'xinjiang', '香港卫视': 'xianggangweishi',
    // 凤凰两台央视 EPG 没有，走凤凰自己的节目单接口 phtvperiodlist
    '凤凰资讯': 'phtvNews', '凤凰中文': 'phtvChinese', '凤凰卫视': 'phtvChinese'
  };

  function trim(s) { return (s || '').replace(/^\s+|\s+$/g, ''); }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function hostOf(url) {
    var m = /^https?:\/\/([^\/]+)/i.exec(url || '');
    return m ? m[1] : '';
  }

  // 节目单按北京时间，日期也按北京时间算（设备可能在别的时区）
  function beijingDay(ms) {
    var d = new Date((ms || Date.now()) + 8 * 3600 * 1000);
    return '' + d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate());
  }

  function beijingClock(sec) {
    var d = new Date(Number(sec) * 1000 + 8 * 3600 * 1000);
    return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
  }

  function streamHeaders(url) {
    var h = { Referer: url };
    if (/\.m3u8(?:[?#]|$)/i.test(url)) h['X-Media-Type'] = 'hls';
    return h;
  }

  // 台标：CCTV 与卫视/凤凰都在仓库里备好 360×480 白底竖版，直接取直链，不再实时处理
  function logoOf(title) {
    var code = EPG_CODES[title];
    if (code && GITEE_CODES[code]) return ICON_BASE + code + '.png';
    return LOGO_BASE + encodeURIComponent(title.replace(/\s+/g, '') + '.png');
  }

  // 统一使用上面的竖版台标，不用 m3u 里自带的横版透明图
  function fixLogo(logo, title) {
    return logoOf(title);
  }

  // 逐行解析 m3u：#EXTINF 取台名/分组/台标，下一行是播放地址
  function parse(text) {
    var lines = (text || '').split(/\r?\n/), meta = null, out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = trim(lines[i]);
      if (!line) continue;
      if (line.indexOf('#EXTINF') === 0) { meta = line; continue; }
      if (line.charAt(0) === '#') continue;
      if (meta) {
        var item = buildItem(meta, line);
        if (item) out.push(item);
      }
      meta = null;
    }
    return out;
  }

  function buildItem(meta, url) {
    var attrs = {}, re = /([\w-]+)="([^"]*)"/g, m;
    while ((m = re.exec(meta))) attrs[m[1]] = m[2];
    var title = meta, idx = title.lastIndexOf(',');
    if (idx >= 0) title = title.substring(idx + 1);
    title = trim(title) || trim(attrs['tvg-name']);
    if (!title || !/^https?:\/\//i.test(url)) return null;
    var group = trim((attrs['group-title'] || '').split(';')[0]) || '其他';
    return { title: title, url: url, logo: fixLogo(attrs['tvg-logo'] || '', title), group: group };
  }

  // 央视 / 卫视 / 其他，作为二级分类
  function subGroupOf(item) {
    if (/^CCTV/i.test(item.title)) return '央视';
    if (/^(CETV|中国教育)/i.test(item.title)) return '其他';
    if (item.title.indexOf('卫视') >= 0) return '卫视';
    return '其他';
  }

  function loadItems(host) {
    var age = host.cacheAge(CACHE_KEY);
    if (age >= 0 && age < CACHE_MS) {
      var cached = host.readCache(CACHE_KEY);
      if (cached) {
        var rows = parse(cached);
        if (rows.length) return rows;
      }
    }
    var text = '';
    try {
      text = host.getString(M3U_URL, { headers: { Referer: 'https://github.com/' } });
    } catch (e) {
      text = host.getString(M3U_BACKUP, { headers: { Referer: 'https://github.com/' } });
    }
    var all = parse(text), keep = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].group === KEEP_GROUP && /^https?:\/\//i.test(all[i].url)) keep.push(all[i]);
    }
    // 只把这一组写进缓存，省得每次重新解析 700 多条
    if (keep.length) host.writeCache(CACHE_KEY, JSON.stringify(keep.map(function (it) {
      return { title: it.title, url: it.url, logo: it.logo, group: it.group };
    })));
    return keep;
  }

  // 凤凰卫视两台：https://ne883dbn.ifeng.com/phtvperiodlist?from=&to=（按天返回
  // phtvNews=凤凰资讯、phtvChinese=凤凰中文），只有开始时刻，用下一档的时刻当结束时刻
  function phNodes(host, day) {
    var key = 'radio-ph-' + day;
    var text = '';
    if (host.cacheAge(key) >= 0 && host.cacheAge(key) < EPG_MS) text = host.readCache(key) || '';
    if (!text) {
      try {
        text = host.getString(PH_API + '?from=' + day + '&to=' + day,
          { headers: { Referer: 'https://phtv.ifeng.com/programme/' } });
        if (text) host.writeCache(key, text);
      } catch (e) {
        host.log('凤凰节目单取不到：' + (e && e.message));
        return {};
      }
    }
    var json = null;
    try { json = parseJson(text); } catch (e2) { return {}; }
    var data = at(json, 'data.' + day);
    if (!data) return {};
    var names = { phtvNews: '凤凰资讯', phtvChinese: '凤凰中文' }, out = {}, k;
    for (k in names) {
      var list = items(data, k), prog = [], i;
      for (i = 0; i < list.length; i++) {
        var hm = str(list[i], 'time'), st = stampOf(day, hm);
        if (!st) continue;
        prog.push({ t: str(list[i], 'title'), st: st, et: 0 });
      }
      for (i = 0; i < prog.length; i++) {
        prog[i].et = i + 1 < prog.length ? prog[i + 1].st : prog[i].st + 3600;
      }
      if (prog.length) out[k] = { isLive: '', channelName: names[k], program: prog };
    }
    return out;
  }

  // 'YYYY-MM-DD' + 'HH:MM' → 北京时间的秒级时间戳
  function stampOf(day, hm) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
    var t = /^(\d{1,2})[：:](\d{2})$/.exec(trim(hm || ''));
    if (!m || !t) return 0;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(t[1]) - 8, Number(t[2])) / 1000;
  }

  // 当天全部台的节目单：一次（分块）请求 epginfo3，缓存 5 分钟
  // 返回 { cctv1: {isLive, channelName, program:[{t,st,et}]}, ... }
  function epgAll(host) {
    var key = EPG_KEY + beijingDay(Date.now());
    var age = host.cacheAge(key);
    if (age >= 0 && age < EPG_MS) {
      var cached = host.readCache(key);
      if (cached) {
        try { return parseJson(cached) || {}; } catch (e) { }
      }
    }
    var codes = [], seen = {}, k;
    for (k in EPG_CODES) {
      if (seen[EPG_CODES[k]] || EPG_CODES[k].indexOf('phtv') === 0) continue;
      seen[EPG_CODES[k]] = 1;
      codes.push(EPG_CODES[k]);
    }
    var map = {}, i, j;
    for (i = 0; i < codes.length; i += 15) {
      var part = codes.slice(i, i + 15);
      var json = null;
      try {
        json = host.getJson(EPG_API + '?serviceId=shiyi&d=' + beijingDay(Date.now()) +
          '&c=' + part.join(','), { headers: { Referer: EPG_REF } });
      } catch (e) {
        host.log('节目单取不到（' + part[0] + '…）：' + (e && e.message));
        continue;
      }
      for (j = 0; j < part.length; j++) {
        var node = at(json, part[j]);
        if (!node) continue;
        var prog = items(node, 'program').map(function (p) {
          return { t: str(p, 't'), st: int(p, 'st'), et: int(p, 'et') };
        });
        map[part[j]] = {
          isLive: str(node, 'isLive'),
          channelName: str(node, 'channelName'),
          program: prog
        };
      }
    }
    // 凤凰两台：央视 EPG 里没有，补上凤凰自己的节目单
    var ph = {};
    try { ph = phNodes(host, beijingDay(Date.now()).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')); } catch (e3) { ph = {}; }
    for (k in ph) map[k] = ph[k];

    if (map) {
      try { host.writeCache(key, JSON.stringify(map)); } catch (e) { }
    }
    return map || {};
  }

  function codeOf(title) { return EPG_CODES[title] || ''; }

  // 正在播的节目名：先用 isLive，没有就按 st/et 判断
  function nowOn(node) {
    if (!node) return '';
    var live = trim(node.isLive);
    if (live) return live;
    var now = Math.floor(Date.now() / 1000), list = items(node, 'program');
    for (var i = 0; i < list.length; i++) {
      if (int(list[i], 'st') <= now && now < int(list[i], 'et')) return str(list[i], 't');
    }
    return '';
  }

  // 当日节目单文本，正在播的那条前面加 ▶
  function scheduleText(node) {
    if (!node) return '';
    var now = Math.floor(Date.now() / 1000), out = [];
    var list = items(node, 'program');
    for (var i = 0; i < list.length; i++) {
      var s = int(list[i], 'st'), e = int(list[i], 'et');
      var on = s <= now && now < e;
      out.push((on ? '▶ ' : '   ') + beijingClock(s) + '  ' + str(list[i], 't'));
    }
    return out.join('\n');
  }

  function countOf(node) { return items(node, 'program').length; }

  function bookOf(it, guide) {
    var node = guide ? guide[codeOf(it.title)] : null;
    var on = nowOn(node), n = countOf(node);
    var intro = '';
    if (on) intro += '正在播出：' + on;
    if (n) intro += (intro ? '\n' : '') + '今日节目单共 ' + n + ' 档，点开查看';
    return {
      title: it.title,
      bookUrl: it.url,
      coverUrl: it.logo,
      author: subGroupOf(it),
      status: on ? '正在播：' + on : '直播',
      intro: intro
    };
  }

  function after(url, prefix) {
    if (url.indexOf(prefix) !== 0) throw new Error('无法识别的分类地址');
    return url.substring(prefix.length);
  }

  registerSource({
    id: 'b4c6d8e0f2a143759687a9b0c1d2e3f5',
    name: '电视伴音',
    url: 'https://github.com/fanmingming/live',
    group: '广播',
    description: '央视与卫视直播的电视伴音（fm.m3u 电视伴音分组），带台标、正在播出的节目和当日节目单，在线收听',

    search: function (keywords, page) {
      var kw = (keywords || '').toLowerCase();
      if (!kw || (page && Number(page) > 1)) return { books: [], totalPage: 1 };
      var list = loadItems(this.host), guide = {}, exact = [], loose = [], i;
      try { guide = epgAll(this.host); } catch (e) { guide = {}; }
      for (i = 0; i < list.length; i++) {
        var t = list[i].title.toLowerCase();
        if (t.indexOf(kw) < 0) continue;
        (t === kw || t.indexOf(kw) === 0 ? exact : loose).push(bookOf(list[i], guide));
      }
      return { books: exact.concat(loose), totalPage: 1 };
    },

    categoryMenus: function () {
      var list = loadItems(this.host);
      var tabs = [{ title: '全部伴音', url: 'ta:all:1' }];
      var names = ['央视', '卫视', '其他'], i, j;
      for (i = 0; i < names.length; i++) {
        for (j = 0; j < list.length; j++) {
          if (subGroupOf(list[j]) === names[i]) {
            tabs.push({ title: names[i], url: 'ta:' + names[i] + ':1' });
            break;
          }
        }
      }
      return [{ title: '电视伴音', tabs: tabs }];
    },

    categoryPage: function (url) {
      var list = loadItems(this.host), isAll = url.indexOf('ta:all') === 0;
      var sub = '', page = 1;
      if (isAll) {
        page = Number(after(url, 'ta:all:')) || 1;
      } else {
        var rest = after(url, 'ta:');
        var cut = rest.lastIndexOf(':');
        sub = cut > 0 ? rest.substring(0, cut) : rest;
        page = cut > 0 ? (Number(rest.substring(cut + 1)) || 1) : 1;
      }
      var guide = {};
      try { guide = epgAll(this.host); } catch (e) { guide = {}; }
      var rows = [], i;
      for (i = 0; i < list.length; i++) {
        if (!isAll && subGroupOf(list[i]) !== sub) continue;
        rows.push(list[i]);
      }
      var start = (page - 1) * PAGE, books = [];
      for (i = start; i < start + PAGE && i < rows.length; i++) books.push(bookOf(rows[i], guide));
      var hasNext = start + PAGE < rows.length;
      return {
        books: books,
        currentPage: page,
        totalPage: Math.max(1, Math.ceil(rows.length / PAGE)),
        nextUrl: hasNext ? (isAll ? 'ta:all:' + (page + 1) : 'ta:' + sub + ':' + (page + 1)) : null
      };
    },

    bookDetail: function (url, loadEpisodes) {
      var host = this.host, list = loadItems(host), item = null;
      for (var i = 0; i < list.length; i++) if (list[i].url === url) item = list[i];
      if (!item) throw new Error('该频道不在当前伴音表中');

      var guide = {}, node = null;
      try { guide = epgAll(host); } catch (e) { guide = {}; }
      node = guide[codeOf(item.title)] || null;
      var on = nowOn(node);
      var schedule = scheduleText(node);

      var intro = '电视伴音：' + item.title + '\n分类：' + subGroupOf(item) + '\n音频源：' + hostOf(url);
      if (on) intro += '\n\n正在播出：' + on;
      if (schedule) {
        var note = codeOf(item.title) === 'phtvNews'
          ? '（凤凰官网未单列资讯台节目单，以下为凤凰卫视节目单，仅供参考）\n' : '';
        intro += '\n\n今日节目单（北京时间）\n' + note + schedule;
      } else {
        intro += '\n\n（这个台还没有节目单数据）';
      }

      var detail = {
        title: item.title,
        coverUrl: item.logo,
        author: subGroupOf(item),
        status: on ? '正在播：' + on : '直播',
        intro: intro,
        episodes: []
      };
      if (loadEpisodes) {
        detail.episodes.push({ title: '直播 · ' + (on || item.title), url: url, live: true });
      }
      return detail;
    },

    audio: function (url) {
      if (!/^https?:\/\//i.test(url)) throw new Error('无法识别的音频地址');
      return { url: url, headers: streamHeaders(url) };
    }
  });
})();
