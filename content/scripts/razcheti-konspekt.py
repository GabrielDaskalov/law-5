# -*- coding: utf-8 -*-
"""
Разчита новия конспект по облигационно право (docx → pandoc → markdown) и го
подрежда в структурата, която платформата ползва:

  sections[] = { title, position, blocks[] }
  blocks[]   = { type: 'p' | 'h' | 'list', text | items, position }

Изходният текст маркира заглавията по два начина, смесени в един и същ файл:
удебелени редове (**I. Въведение**) и markdown решетки (## I. Въведение).
Освен това в тема 34 стилът е приложен погрешно и целият текст е излязъл като
заглавия от второ ниво — затова заглавие над 160 знака се третира като абзац.
Проверено: между 160 и 300 знака няма нито едно истинско заглавие, тоест
границата е чиста, а не произволна.
"""
import io, json, os, re, collections, unicodedata

# Пътищата се смятат спрямо самия файл.
TUK = os.path.dirname(os.path.abspath(__file__))
MATERIALI = os.path.join(os.path.dirname(TUK), 'novi-materiali')
IZVOR = os.environ.get('KONSPEKT_MD', os.path.join(MATERIALI, 'konspekt.md'))
IZHOD = os.environ.get('KONSPEKT_JSON', os.path.join(MATERIALI, 'konspekt.json'))

PRAG_ZAGLAVIE = 160          # над това не е заглавие, а сгрешен абзац
RIMSKO = re.compile(r'^([IVX]+)\.\s*(.+)$')
NOMERIRANO = re.compile(r'^(\d+)\.\s*(.+)$')
NE_ZA_PUBLIKUVANE = re.compile(
    r'не за публикуване|вътрешния архив|Бележка към редакцията', re.I)


def pochisti(s):
    """Маха артефактите от pandoc, без да пипа смисъла."""
    s = unicodedata.normalize('NFKC', s)
    s = s.replace('\\', '')
    s = re.sub(r'(?<!-)---(?!-)', '—', s)
    s = re.sub(r'(?<!-)--(?!-)', '–', s)
    s = re.sub(r'\*\*(.+?)\*\*', r'\1', s)
    s = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'\1', s)
    s = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', s)
    s = re.sub(r'[ \t]+', ' ', s)
    return s.strip()


def kakvo_e(red):
    """('sek'|'h'|'list'|'p', текст) или None за празен ред."""
    r = red.strip()
    if not r:
        return None

    m = re.match(r'^[-*]\s+(.+)$', r)
    if m and not r.startswith('**'):
        return ('list', pochisti(m.group(1)))

    vatre = None
    m = re.match(r'^(#{2,4})\s+(.+?)\s*$', r)
    if m:
        vatre = m.group(2)
    else:
        m = re.match(r'^\*\*([^*\n].*?)\*\*\s*$', r)
        if m:
            vatre = m.group(1)

    if vatre is not None:
        gol = pochisti(vatre)
        if not gol:
            return None
        if len(gol) > PRAG_ZAGLAVIE:
            return ('p', gol)               # сгрешен стил — това е абзац
        mr = RIMSKO.match(gol)
        if mr:
            return ('sek', pochisti(mr.group(2)))
        mn = NOMERIRANO.match(gol)
        if mn:
            return ('h', pochisti(mn.group(2)))
        return ('sek', gol)

    txt = pochisti(r)
    # Останки от конвертирането: самотни решетки и колонтитули („Страница").
    if not txt or re.fullmatch(r'#{1,6}|Страница|\d+|[-–—•]+', txt):
        return None
    return ('p', txt)


def razberi_tema(telo):
    sekcii, tek, spisak = [], None, None

    def zatvori_spisak():
        nonlocal spisak
        if spisak and tek is not None:
            tek['blocks'].append({'type': 'list', 'items': spisak})
        spisak = None

    def nova(title):
        nonlocal tek
        zatvori_spisak()
        tek = {'title': title, 'blocks': []}
        sekcii.append(tek)

    for red in telo.split('\n'):
        vid = kakvo_e(red)
        if vid is None:
            zatvori_spisak()
            continue
        kak, txt = vid

        if kak == 'list':
            if spisak is None:
                spisak = []
            spisak.append(txt)
            continue

        zatvori_spisak()
        if kak == 'sek':
            nova(txt)
        else:
            if tek is None:
                nova('Въведение')
            tek['blocks'].append({'type': kak, 'text': txt})

    zatvori_spisak()

    izhod = []
    for s in sekcii:
        if not s['blocks'] or NE_ZA_PUBLIKUVANE.search(s['title'] or ''):
            continue
        if all(b['type'] == 'h' for b in s['blocks']):
            continue                        # само заглавия, без съдържание
        for j, b in enumerate(s['blocks']):
            b['position'] = j
        s['position'] = len(izhod)
        izhod.append(s)
    return izhod


def glavno():
    t = io.open(IZVOR, encoding='utf-8').read()
    # Заглавията на темите са писани по три начина: „Тема 1.", „ТЕМА 28.", „Тема № 31."
    delitel = r'^# ([Тт][Ее][Мм][Аа]\s*(?:№\s*)?\d+\s*[.:]?\s*.*)$'
    parcheta = re.split(delitel, t, flags=re.M)

    temi = []
    for i in range(1, len(parcheta), 2):
        m = re.match(r'[Тт][Ее][Мм][Аа]\s*(?:№\s*)?(\d+)\s*[.:]?\s*(.*)$', parcheta[i])
        nomer = int(m.group(1))
        zaglavie = pochisti(m.group(2)).strip(' .')
        sekcii = razberi_tema(parcheta[i + 1])
        znaci = sum(len(b.get('text') or ' '.join(b.get('items', [])))
                    for s in sekcii for b in s['blocks'])
        temi.append({'nomer': nomer, 'zaglavie': zaglavie,
                     'heading': f'Тема {nomer}. {zaglavie}',
                     'sections': sekcii, 'znaci': znaci})

    temi.sort(key=lambda x: x['nomer'])
    json.dump(temi, open(IZHOD, 'w'), ensure_ascii=False, indent=1)

    n = [x['nomer'] for x in temi]
    bl = [b for x in temi for s in x['sections'] for b in s['blocks']]
    print(f'теми: {len(temi)} · номера {min(n)}–{max(n)}')
    dubl = [k for k, v in collections.Counter(n).items() if v > 1]
    print(f'повтарящи се номера: {dubl or "няма"}')
    print(f'липсващи номера: {[i for i in range(1, 78) if i not in n]}')
    print(f'секции: {sum(len(x["sections"]) for x in temi)} · '
          f'блокове: {dict(collections.Counter(b["type"] for b in bl))}')
    zn = sorted(x['znaci'] for x in temi)
    print(f'знаци на тема: {zn[0]} · средно {sum(zn)//len(zn)} · {zn[-1]}')
    losho = [(x['nomer'], x['znaci'], len(x['sections']))
             for x in temi if x['znaci'] < 2500 or not x['sections']]
    print(f'подозрителни теми: {losho or "няма"}')


if __name__ == '__main__':
    glavno()
