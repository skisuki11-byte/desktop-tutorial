/**
 * 秘書に持たせる道具。
 *
 * 定義（Claude に見せる説明）と、実行（こちらでやること）が対になっている。
 * 説明文は Claude が読む唯一の手がかりなので、曖昧に書かない。
 */

function toolDefs_() {
  return [
    /* ---- 予定 ---- */
    {
      name: 'add_event',
      description: '予定をGoogleカレンダーに入れる。日時が決まっている用事はこれ。日時が未定のものは add_task を使う。',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '予定の名前。短く（例: 歯医者、山田さんと打合せ）' },
          start: { type: 'string', description: '開始。"2026-08-08T15:00" 形式。終日なら "2026-08-08"' },
          end: { type: 'string', description: '終了。省略すると1時間後（終日なら当日中）' },
          location: { type: 'string', description: '場所。無ければ省略' },
          description: { type: 'string', description: '補足。無ければ省略' }
        },
        required: ['title', 'start']
      }
    },
    {
      name: 'list_events',
      description: '期間を指定してカレンダーの予定を読む。「今日の予定は？」「来週空いてる？」に答えるときに使う。',
      input_schema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '開始日。"2026-08-08" 形式' },
          to: { type: 'string', description: '終了日（この日を含む）。省略すると from と同じ日' }
        },
        required: ['from']
      }
    },
    {
      name: 'update_event',
      description: '既にある予定の時間・名前・場所を変える。先に list_events で event_id を調べること。',
      input_schema: {
        type: 'object',
        properties: {
          event_id: { type: 'string' },
          title: { type: 'string' },
          start: { type: 'string', description: '"2026-08-08T15:00" 形式' },
          end: { type: 'string' },
          location: { type: 'string' }
        },
        required: ['event_id']
      }
    },
    {
      name: 'delete_event',
      description: '予定を消す。先に list_events で event_id を調べること。消す前に本人に確認する。',
      input_schema: {
        type: 'object',
        properties: { event_id: { type: 'string' } },
        required: ['event_id']
      }
    },

    /* ---- 用事（やり通すためのもの） ---- */
    {
      name: 'add_task',
      description:
        'あとでやること・やってもらうことを控える。' +
        'その場で終わらない依頼は必ずこれに残すこと。残さなければ忘れる。' +
        '期限を入れておくと、こちらから声をかけて終わるまで追いかける。',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '何をするか。動詞で終える（例: 請求書を出す）' },
          detail: { type: 'string', description: '思い出すのに要る補足。相手の名前、金額、経緯など' },
          due: { type: 'string', description: '期限。"2026-08-08T17:00" または "2026-08-08"。無ければ省略' }
        },
        required: ['title']
      }
    },
    {
      name: 'list_tasks',
      description: '控えてある用事を読む。「何が残ってる？」に答えるとき、また新しい依頼が既にあるものと重なっていないか確かめるときに使う。',
      input_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['open', 'done', 'all'], description: '既定は open（未完了）' }
        }
      }
    },
    {
      name: 'complete_task',
      description: '用事が終わったことにする。「あれ終わったよ」と言われたら、list_tasks で探してからこれを呼ぶ。',
      input_schema: {
        type: 'object',
        properties: { task_id: { type: 'string' } },
        required: ['task_id']
      }
    },
    {
      name: 'update_task',
      description: '用事の中身や期限を直す。取りやめるときは status に canceled を入れる。',
      input_schema: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          title: { type: 'string' },
          detail: { type: 'string' },
          due: { type: 'string' },
          status: { type: 'string', enum: ['open', 'done', 'canceled'] }
        },
        required: ['task_id']
      }
    },

    /* ---- メモ・議事録 ---- */
    {
      name: 'save_memo',
      description:
        'メモや議事録として残す。あとから探せるように、聞いた話は要約せず要点を落とさずに書く。' +
        '「これ控えといて」「議事録にして」と言われたとき、また写真から読み取った内容を残すときに使う。',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '残す本文。日付・人名・数字は省かない' },
          tags: { type: 'string', description: 'あとで探すための語をカンマ区切りで（例: 打合せ,A社,見積）' }
        },
        required: ['text']
      }
    },
    {
      name: 'search_memos',
      description: '残してあるメモを探す。「あの件どうだった？」と聞かれたら、答える前にまずこれで探す。',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '探す語。空白区切りで複数可' },
          limit: { type: 'integer', description: '既定5' }
        },
        required: ['query']
      }
    },

    /* ---- 覚える（育つところ） ---- */
    {
      name: 'remember',
      description:
        '次回以降もずっと効くことを覚える。好み、習慣、決まった段取り、人や場所の呼びかた、避けたいこと。' +
        '一度きりの事実（今日の予定、今回の金額）は覚えない。それは予定とメモの仕事。' +
        '同じことを二度聞かないために使う道具。',
      input_schema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['好み', '習慣', '人', '仕事', '連絡', 'その他'],
            description: '分類'
          },
          fact: { type: 'string', description: '一文で。主語を省かない（例: 打合せは午前を避けたい）' }
        },
        required: ['category', 'fact']
      }
    },
    {
      name: 'forget',
      description: '覚えていることが古くなった・間違っていたときに消す。「もうそれは違う」と言われたら使う。',
      input_schema: {
        type: 'object',
        properties: { memory_id: { type: 'string' } },
        required: ['memory_id']
      }
    },

    /* ---- 調べもの（Anthropic 側で実行される道具） ---- */
    { type: 'web_search_20260209', name: 'web_search', max_uses: 5 }
  ];
}

/** Claude が使いたいと言った道具を実行する */
function runTool_(name, input, userId) {
  switch (name) {
    case 'add_event': return tAddEvent_(input);
    case 'list_events': return tListEvents_(input);
    case 'update_event': return tUpdateEvent_(input);
    case 'delete_event': return tDeleteEvent_(input);
    case 'add_task': return tAddTask_(input, userId);
    case 'list_tasks': return tListTasks_(input, userId);
    case 'complete_task': return tCompleteTask_(input);
    case 'update_task': return tUpdateTask_(input);
    case 'save_memo': return tSaveMemo_(input, userId);
    case 'search_memos': return tSearchMemos_(input, userId);
    case 'remember': return tRemember_(input, userId);
    case 'forget': return tForget_(input);
    default: return { ok: false, error: '知らない道具です: ' + name };
  }
}

/* ================= 予定 ================= */

function calendar_() {
  var id = cfg_('CALENDAR_ID');
  if (!id || id === 'primary') return CalendarApp.getDefaultCalendar();
  var cal = CalendarApp.getCalendarById(id);
  if (!cal) throw new Error('カレンダーが見つかりません: ' + id);
  return cal;
}

function tAddEvent_(a) {
  var start = parseLocal_(a.start);
  if (!start) return { ok: false, error: 'start を読めません: ' + a.start };

  var cal = calendar_();
  var opts = {};
  if (a.location) opts.location = a.location;
  if (a.description) opts.description = a.description;

  var ev;
  if (isDateOnly_(a.start)) {
    var endDay = a.end ? parseLocal_(a.end) : null;
    ev = endDay ? cal.createAllDayEvent(a.title, start, addDays_(endDay, 1), opts)
                : cal.createAllDayEvent(a.title, start, opts);
  } else {
    var end = a.end ? parseLocal_(a.end) : addMinutes_(start, 60);
    if (end <= start) end = addMinutes_(start, 60);
    ev = cal.createEvent(a.title, start, end, opts);
  }

  return {
    ok: true,
    event_id: ev.getId(),
    title: ev.getTitle(),
    when: isDateOnly_(a.start) ? fmtDate_(start) + ' 終日' : fmtDateTime_(start)
  };
}

function tListEvents_(a) {
  var from = parseLocal_(a.from);
  if (!from) return { ok: false, error: 'from を読めません: ' + a.from };
  var to = a.to ? parseLocal_(a.to) : from;
  var events = calendar_().getEvents(startOfDay_(from), addDays_(startOfDay_(to), 1));

  return {
    ok: true,
    count: events.length,
    events: events.map(function (ev) {
      return {
        event_id: ev.getId(),
        title: ev.getTitle(),
        when: ev.isAllDayEvent()
          ? fmtDate_(ev.getStartTime()) + ' 終日'
          : fmtDateTime_(ev.getStartTime()) + '〜' + Utilities.formatDate(ev.getEndTime(), TZ, 'HH:mm'),
        start: toLocalIso_(ev.getStartTime()),
        location: ev.getLocation() || ''
      };
    })
  };
}

function tUpdateEvent_(a) {
  var ev = calendar_().getEventById(a.event_id);
  if (!ev) return { ok: false, error: 'その予定が見つかりません' };
  if (a.title) ev.setTitle(a.title);
  if (a.location != null) ev.setLocation(a.location);
  if (a.start) {
    var s = parseLocal_(a.start);
    var e = a.end ? parseLocal_(a.end) : addMinutes_(s, 60);
    if (!s) return { ok: false, error: 'start を読めません' };
    if (e <= s) e = addMinutes_(s, 60);
    ev.setTime(s, e);
  }
  return { ok: true, event_id: ev.getId(), title: ev.getTitle(), when: fmtDateTime_(ev.getStartTime()) };
}

function tDeleteEvent_(a) {
  var ev = calendar_().getEventById(a.event_id);
  if (!ev) return { ok: false, error: 'その予定が見つかりません' };
  var title = ev.getTitle();
  ev.deleteEvent();
  return { ok: true, deleted: title };
}

/* ================= 用事 ================= */

function tAddTask_(a, userId) {
  var due = a.due ? parseLocal_(a.due) : null;
  var rec = insert_('tasks', {
    userId: userId,
    title: a.title,
    detail: a.detail || '',
    due: due ? toLocalIso_(due) : '',
    remindAt: due ? toLocalIso_(addMinutes_(due, -NUDGE_LEAD_MIN)) : '',
    status: 'open',
    nudges: 0,
    lastNudgeAt: ''
  });
  return { ok: true, task_id: rec.id, title: rec.title, due: due ? fmtDateTime_(due) : 'なし' };
}

function tListTasks_(a, userId) {
  var want = (a && a.status) || 'open';
  var list = rows_('tasks').filter(function (r) {
    if (String(r.userId) !== String(userId)) return false;
    return want === 'all' ? true : String(r.status) === want;
  });
  list.sort(function (x, y) { return String(x.due || '9999') < String(y.due || '9999') ? -1 : 1; });

  return {
    ok: true,
    count: list.length,
    tasks: list.map(function (r) {
      var due = r.due ? parseLocal_(r.due) : null;
      return {
        task_id: r.id,
        title: r.title,
        detail: truncate_(r.detail, 200),
        due: due ? fmtDateTime_(due) : '',
        overdue: !!(due && due < now_() && r.status === 'open'),
        status: r.status
      };
    })
  };
}

function tCompleteTask_(a) {
  var rec = update_('tasks', a.task_id, { status: 'done' });
  if (!rec) return { ok: false, error: 'その用事が見つかりません' };
  return { ok: true, title: rec.title };
}

function tUpdateTask_(a) {
  var patch = {};
  if (a.title) patch.title = a.title;
  if (a.detail != null) patch.detail = a.detail;
  if (a.status) patch.status = a.status;
  if (a.due != null) {
    var due = a.due ? parseLocal_(a.due) : null;
    patch.due = due ? toLocalIso_(due) : '';
    patch.remindAt = due ? toLocalIso_(addMinutes_(due, -NUDGE_LEAD_MIN)) : '';
    patch.nudges = 0;          // 期限を引き直したら催促も数え直す
    patch.lastNudgeAt = '';
  }
  var rec = update_('tasks', a.task_id, patch);
  if (!rec) return { ok: false, error: 'その用事が見つかりません' };
  return { ok: true, title: rec.title, due: rec.due ? fmtDateTime_(parseLocal_(rec.due)) : 'なし', status: rec.status };
}

/* ================= メモ ================= */

function tSaveMemo_(a, userId) {
  var rec = insert_('memos', { userId: userId, text: a.text, tags: a.tags || '' });
  return { ok: true, memo_id: rec.id, saved: truncate_(a.text, 60) };
}

function tSearchMemos_(a, userId) {
  var words = String(a.query || '').split(/[\s、,]+/).filter(Boolean).map(function (w) { return w.toLowerCase(); });
  var limit = a.limit || 5;

  var hits = rows_('memos')
    .filter(function (r) { return String(r.userId) === String(userId); })
    .map(function (r) {
      var hay = (String(r.text) + ' ' + String(r.tags)).toLowerCase();
      var score = words.reduce(function (n, w) { return n + (hay.indexOf(w) >= 0 ? 1 : 0); }, 0);
      return { rec: r, score: score };
    })
    .filter(function (h) { return h.score > 0; });

  // 一致した語が多い順、同点なら新しい順
  hits.sort(function (x, y) {
    if (y.score !== x.score) return y.score - x.score;
    return String(y.rec.createdAt) < String(x.rec.createdAt) ? -1 : 1;
  });

  return {
    ok: true,
    count: hits.length,
    memos: hits.slice(0, limit).map(function (h) {
      return {
        memo_id: h.rec.id,
        date: fmtDate_(parseLocal_(h.rec.createdAt)),
        tags: h.rec.tags,
        text: truncate_(h.rec.text, 900)
      };
    })
  };
}

/* ================= 覚える ================= */

function tRemember_(a, userId) {
  var fact = String(a.fact || '').trim();
  if (!fact) return { ok: false, error: 'fact が空です' };

  // 同じことを二重に覚えない
  var same = rows_('memory').filter(function (r) {
    return String(r.userId) === String(userId) && String(r.fact).trim() === fact;
  })[0];
  if (same) {
    update_('memory', same.id, { hits: Number(same.hits || 0) + 1 });
    return { ok: true, memory_id: same.id, note: 'すでに覚えていました' };
  }

  var rec = insert_('memory', { userId: userId, category: a.category || 'その他', fact: fact, hits: 1 });
  return { ok: true, memory_id: rec.id, remembered: fact };
}

function tForget_(a) {
  var rec = find_('memory', a.memory_id);
  if (!rec) return { ok: false, error: 'その項目が見つかりません' };
  remove_('memory', a.memory_id);
  return { ok: true, forgot: rec.fact };
}
