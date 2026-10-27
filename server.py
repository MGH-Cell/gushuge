# -*- coding: utf-8 -*-
"""古书阁 · 轻后端（仅 Python 标准库）
启动：python server.py  （端口 5500，同时服务静态文件与 API）
数据：data/dh.json  {users:{名:{pw,salt,ts}}, sessions:{token:名}, events:{名:[...]}, blobs:{名:{...}}}
"""
import json, os, re, hashlib, secrets, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE, 'data')
DATA_FILE = os.path.join(DATA_DIR, 'dh.json')
LOCK = threading.Lock()

def load_db():
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {'users': {}, 'sessions': {}, 'events': {}, 'blobs': {}}

def save_db(db):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = DATA_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False)
    os.replace(tmp, DATA_FILE)

def hash_pw(pw, salt):
    return hashlib.sha256((salt + ':' + pw).encode('utf-8')).hexdigest()

# 学分 = 完卷*100 + 完美卷*50 + 百题答对*5 + 错题掌握*8（按快照 gushi_v1 实时计算）
def calc_score(blob):
    try:
        p = blob.get('p', {})
        done = perfect = 0
        for pid, o in p.items():
            if not isinstance(o, dict):
                continue
            if o.get('done'):
                done += 1
                ex = o.get('exam') or {}
                if ex.get('perfect'):
                    perfect += 1
        b = blob.get('btf') or {}
        btf_right = len(b.get('answered') or [])
        btf_mastered = len(b.get('mastered') or [])
        return done * 100 + perfect * 50 + btf_right * 5 + btf_mastered * 8, \
               {'done': done, 'perfect': perfect, 'btfRight': btf_right, 'btfMastered': btf_mastered}
    except Exception:
        return 0, {'done': 0, 'perfect': 0, 'btfRight': 0, 'btfMastered': 0}

def user_score(db, u):
    return calc_score(db.get('blobs', {}).get(u, {}))

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # 静默访问日志

    # ---- 工具 ----
    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self._api_no_store = True
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        # 静态页禁缓存：改版后浏览器永远拉最新，不再出现"首页点进去还是旧的"
        if not getattr(self, '_api_no_store', False):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def read_body(self):
        try:
            n = int(self.headers.get('Content-Length') or 0)
            if n <= 0 or n > 1 << 20:
                return None
            return json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            return None

    def whoami(self, token=None):
        """解析 token 为用户名，未登录返回 None。token 缺省时取 URL query"""
        if token is None:
            try:
                from urllib.parse import urlparse, parse_qs
                q = parse_qs(urlparse(self.path).query)
                token = (q.get('token') or [''])[0]
            except Exception:
                return None
        with LOCK:
            db = load_db()
            return db.get('sessions', {}).get(token)

    # ---- API ----
    def api_register(self, body):
        if not body:
            return self.send_json({'ok': 0, 'err': '请求无效'})
        u = str(body.get('u') or '').strip()
        p = str(body.get('p') or '')
        if not (2 <= len(u) <= 12) or not re.fullmatch(r'[\w\u4e00-\u9fff\-]+', u):
            return self.send_json({'ok': 0, 'err': '书名需 2~12 字（中文/字母/数字）'})
        if len(p) < 4:
            return self.send_json({'ok': 0, 'err': '口令至少 4 位'})
        with LOCK:
            db = load_db()
            if u in db.get('users', {}):
                return self.send_json({'ok': 0, 'err': '此书名已被登记'})
            salt = secrets.token_hex(8)
            db.setdefault('users', {})[u] = {'salt': salt, 'pw': hash_pw(p, salt), 'ts': __import__('time').time()}
            token = secrets.token_hex(16)
            db.setdefault('sessions', {})[token] = u
            save_db(db)
        return self.send_json({'ok': 1, 'token': token, 'u': u})

    def api_login(self, body):
        if not body:
            return self.send_json({'ok': 0, 'err': '请求无效'})
        u = str(body.get('u') or '').strip()
        p = str(body.get('p') or '')
        with LOCK:
            db = load_db()
            rec = db.get('users', {}).get(u)
            if not rec or rec['pw'] != hash_pw(p, rec['salt']):
                return self.send_json({'ok': 0, 'err': '书名或口令不确'})
            token = secrets.token_hex(16)
            db.setdefault('sessions', {})[token] = u
            save_db(db)
        return self.send_json({'ok': 1, 'token': token, 'u': u})

    def api_me(self):
        u = self.whoami()
        if not u:
            return self.send_json({'ok': 0, 'err': '未登录'})
        with LOCK:
            db = load_db()
        score, det = user_score(db, u)
        return self.send_json({'ok': 1, 'u': u, 'score': score, 'det': det})

    def api_track(self, body):
        if not body:
            return self.send_json({'ok': 0, 'err': '请求无效'})
        u = self.whoami((body.get('token') or '')[0:64])
        ev = str(body.get('ev') or '')[:24]
        k = str(body.get('k') or '')[:12]
        if not ev:
            return self.send_json({'ok': 0, 'err': '缺事件'})
        item = {
            'ev': ev, 'k': k, 'v': body.get('v') or 0,
            't': body.get('t') or __import__('time').time() * 1000
        }
        blob = body.get('blob')
        with LOCK:
            db = load_db()
            evs = db.setdefault('events', {}).setdefault(u, [])
            evs.append(item)
            del evs[:-500]  # 每人保留最近 500 条
            if isinstance(blob, dict):
                db.setdefault('blobs', {})[u] = blob
            save_db(db)
        return self.send_json({'ok': 1})

    def api_sync(self):
        u = self.whoami()
        if not u:
            return self.send_json({'ok': 0, 'err': '未登录'})
        with LOCK:
            db = load_db()
        blob = db.get('blobs', {}).get(u)
        return self.send_json({'ok': 1, 'blob': blob})

    def api_board(self):
        with LOCK:
            db = load_db()
        rows = []
        for u, rec in db.get('users', {}).items():
            score, det = user_score(db, u)
            evs = db.get('events', {}).get(u) or []
            last = evs[-1]['t'] if evs else rec.get('ts', 0) * 1000
            rows.append({'u': u, 'score': score, 'last': last, **det})
        rows.sort(key=lambda r: (-r['score'], r['u']))
        return self.send_json({'ok': 1, 'rows': rows})

    def api_history(self):
        u = self.whoami()
        if not u:
            return self.send_json({'ok': 0, 'err': '未登录'})
        with LOCK:
            db = load_db()
        evs = list(db.get('events', {}).get(u) or [])
        evs.reverse()
        return self.send_json({'ok': 1, 'u': u, 'rows': evs})

    # ---- 社区 API ----
    def _teachers(self, db):
        return set(db.setdefault('teachers', ['老师']))

    def _notice(self, db, who, ntype, title, body):
        arr = db.setdefault('notices', {}).setdefault(who, [])
        arr.append({'ts': __import__('time').time() * 1000, 'type': ntype,
                    'title': title[:40], 'body': body[:200], 'read': False})
        del arr[:-100]  # 每人保留最近 100 条

    def api_community(self):
        u = self.whoami()
        if not u:
            return self.send_json({'ok': 0, 'err': '未登录'})
        with LOCK:
            db = load_db()
            teachers = self._teachers(db)
            users = db.setdefault('users', {})
            me = users.setdefault(u, {})
            sq_ts = me.get('sq_ts', 0)
            notices = list(db.get('notices', {}).get(u) or [])
            notices.reverse()
            unread = sum(1 for n in notices if not n.get('read'))
            unread += sum(1 for b in db.get('boards', []) if b.get('ts', 0) > sq_ts)
        posts = sorted(db.get('posts', []), key=lambda p: p.get('ts', 0), reverse=True)[:200]
        groups = sorted(db.get('groups', []), key=lambda g: g.get('ts', 0))
        boards = sorted(db.get('boards', []), key=lambda b: b.get('ts', 0), reverse=True)[:50]
        return self.send_json({'ok': 1, 'u': u, 'teacher': u in teachers,
                               'posts': posts, 'groups': groups, 'boards': boards,
                               'notices': notices[:50], 'unread': unread})

    def api_sq_post(self, body):
        if not body:
            return self.send_json({'ok': 0, 'err': '请求无效'})
        u = self.whoami((body.get('token') or '')[0:64])
        if not u:
            return self.send_json({'ok': 0, 'err': '未登录'})
        kind = body.get('kind')
        title = str(body.get('title') or '').strip()[:60]
        text = str(body.get('body') or '').strip()[:2000]
        gid = str(body.get('gid') or '')[:16]
        if kind not in ('q', 't', 'g'):
            return self.send_json({'ok': 0, 'err': '类型不明'})
        if not title or not text:
            return self.send_json({'ok': 0, 'err': '题目与正文都要写'})
        with LOCK:
            db = load_db()
            if kind == 'g':
                g = next((x for x in db.get('groups', []) if x.get('gid') == gid), None)
                if not g:
                    return self.send_json({'ok': 0, 'err': '小组不存在'})
                if u not in g.get('members', []):
                    return self.send_json({'ok': 0, 'err': '先加入小组再发帖'})
            pid = secrets.token_hex(4) + hex(int(__import__('time').time()))[2:]
            db.setdefault('posts', []).append({
                'id': pid, 'kind': kind, 'gid': gid if kind == 'g' else '',
                'author': u, 'title': title, 'body': text,
                'ts': __import__('time').time() * 1000, 'replies': []})
            save_db(db)
        return self.send_json({'ok': 1, 'id': pid})

    def api_sq_reply(self, body):
        if not body:
            return self.send_json({'ok': 0, 'err': '请求无效'})
        u = self.whoami((body.get('token') or '')[0:64])
        if not u:
            return self.send_json({'ok': 0, 'err': '未登录'})
        pid = str(body.get('pid') or '')[:24]
        text = str(body.get('body') or '').strip()[:1000]
        if not text:
            return self.send_json({'ok': 0, 'err': '写点内容再回'})
        with LOCK:
            db = load_db()
            post = next((x for x in db.get('posts', []) if x.get('id') == pid), None)
            if not post:
                return self.send_json({'ok': 0, 'err': '帖子不见了'})
            if post.get('kind') == 'g':
                g = next((x for x in db.get('groups', []) if x.get('gid') == post.get('gid')), None)
                if g and u not in g.get('members', []):
                    return self.send_json({'ok': 0, 'err': '先加入小组再回帖'})
            teachers = self._teachers(db)
            post.setdefault('replies', []).append({
                'author': u, 'body': text,
                'ts': __import__('time').time() * 1000, 'teacher': u in teachers})
            if post.get('author') != u:
                kindname = {'q': '问题', 't': '话题', 'g': '组帖'}.get(post.get('kind'), '帖子')
                self._notice(db, post['author'], 'reply',
                             '你的' + kindname + '有了新回应',
                             u + '：' + text)
            save_db(db)
        return self.send_json({'ok': 1})

    def api_sq_group(self, body):
        if not body:
            return self.send_json({'ok': 0, 'err': '请求无效'})
        u = self.whoami((body.get('token') or '')[0:64])
        if not u:
            return self.send_json({'ok': 0, 'err': '未登录'})
        name = str(body.get('name') or '').strip()[:20]
        desc = str(body.get('desc') or '').strip()[:120]
        if not name:
            return self.send_json({'ok': 0, 'err': '给小组起个名'})
        with LOCK:
            db = load_db()
            if any(g.get('name') == name for g in db.get('groups', [])):
                return self.send_json({'ok': 0, 'err': '已有同名小组'})
            gid = secrets.token_hex(4)
            db.setdefault('groups', []).append({
                'gid': gid, 'name': name, 'desc': desc,
                'owner': u, 'members': [u], 'ts': __import__('time').time() * 1000})
            save_db(db)
        return self.send_json({'ok': 1, 'gid': gid})

    def api_sq_join(self, body):
        if not body:
            return self.send_json({'ok': 0, 'err': '请求无效'})
        u = self.whoami((body.get('token') or '')[0:64])
        if not u:
            return self.send_json({'ok': 0, 'err': '未登录'})
        gid = str(body.get('gid') or '')[:16]
        with LOCK:
            db = load_db()
            g = next((x for x in db.get('groups', []) if x.get('gid') == gid), None)
            if not g:
                return self.send_json({'ok': 0, 'err': '小组不存在'})
            mem = g.setdefault('members', [])
            if u in mem:
                if g.get('owner') == u:
                    return self.send_json({'ok': 0, 'err': '社长不能退自己组'})
                mem.remove(u)
                joined = False
            else:
                mem.append(u)
                joined = True
            save_db(db)
        return self.send_json({'ok': 1, 'joined': joined})

    def api_sq_read(self, body):
        u = self.whoami((body.get('token') or '')[0:64]) if body else None
        if not u:
            return self.send_json({'ok': 0, 'err': '未登录'})
        with LOCK:
            db = load_db()
            me = db.setdefault('users', {}).setdefault(u, {})
            me['sq_ts'] = __import__('time').time() * 1000
            for n in db.get('notices', {}).get(u, []):
                n['read'] = True
            save_db(db)
        return self.send_json({'ok': 1})

    def api_sq_announce(self, body):
        if not body:
            return self.send_json({'ok': 0, 'err': '请求无效'})
        u = self.whoami((body.get('token') or '')[0:64])
        if not u:
            return self.send_json({'ok': 0, 'err': '未登录'})
        with LOCK:
            db = load_db()
            teachers = self._teachers(db)
            if u not in teachers:
                return self.send_json({'ok': 0, 'err': '只有师者可以发通知'})
        kind = body.get('kind')
        title = str(body.get('title') or '').strip()[:60]
        text = str(body.get('body') or '').strip()[:1000]
        if kind not in ('hw', 'course', 'exam'):
            return self.send_json({'ok': 0, 'err': '通知类型不明'})
        if not title or not text:
            return self.send_json({'ok': 0, 'err': '题目与正文都要写'})
        with LOCK:
            db = load_db()
            db.setdefault('boards', []).append({
                'id': secrets.token_hex(4), 'kind': kind, 'title': title,
                'body': text, 'by': u, 'ts': __import__('time').time() * 1000})
            save_db(db)
        return self.send_json({'ok': 1})

    def api_sq_del(self, body):
        if not body:
            return self.send_json({'ok': 0, 'err': '请求无效'})
        u = self.whoami((body.get('token') or '')[0:64])
        if not u:
            return self.send_json({'ok': 0, 'err': '未登录'})
        pid = str(body.get('pid') or '')[:24]
        with LOCK:
            db = load_db()
            teachers = self._teachers(db)
            posts = db.get('posts', [])
            post = next((x for x in posts if x.get('id') == pid), None)
            if not post:
                return self.send_json({'ok': 0, 'err': '帖子不见了'})
            if post.get('author') != u and u not in teachers:
                return self.send_json({'ok': 0, 'err': '只能删自己的帖子'})
            posts.remove(post)
            save_db(db)
        return self.send_json({'ok': 1})

    # ---- 路由 ----
    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/api/me':
            return self.api_me()
        if path == '/api/sync':
            return self.api_sync()
        if path == '/api/board':
            return self.api_board()
        if path == '/api/history':
            return self.api_history()
        if path == '/api/community':
            return self.api_community()
        return super().do_GET()

    def do_POST(self):
        path = self.path.split('?')[0]
        body = self.read_body()
        if path == '/api/register':
            return self.api_register(body)
        if path == '/api/login':
            return self.api_login(body)
        if path == '/api/track':
            return self.api_track(body)
        if path == '/api/community/post':
            return self.api_sq_post(body)
        if path == '/api/community/reply':
            return self.api_sq_reply(body)
        if path == '/api/community/group':
            return self.api_sq_group(body)
        if path == '/api/community/join':
            return self.api_sq_join(body)
        if path == '/api/community/read':
            return self.api_sq_read(body)
        if path == '/api/community/announce':
            return self.api_sq_announce(body)
        if path == '/api/community/del':
            return self.api_sq_del(body)
        if path == '/api/':
            return self.send_json({'ok': 0, 'err': '未知接口'})
        return super().do_POST()

if __name__ == '__main__':
    os.chdir(BASE)
    srv = None
    for port in (5500, 5757, 5800, 8765, 5900):
        try:
            srv = ThreadingHTTPServer(('127.0.0.1', port), Handler)
            break
        except OSError:
            continue
    if not srv:
        raise SystemExit('所有候选端口均被占用')
    print('古书阁后端已启 · http://localhost:%d' % srv.server_address[1])
    srv.serve_forever()
