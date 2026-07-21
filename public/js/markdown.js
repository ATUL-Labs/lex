'use strict';

// ---------- markdown renderer ----------
// renderMarkdown(text) -> DocumentFragment. DOM-node building only, no innerHTML.
var KV_RE = /^(\w[\w-]*):\s*(.*)$/;
var HEADING_RE = /^(#{1,3})\s+(.*)$/;
var LIST_RE = /^(\s*)(?:[-*]|(\d+)\.)\s+(.*)$/;
var CHECKBOX_RE = /^\s*(?:[-*]|\d+\.)\s*\[([ xX])\]\s*(.*)$/;
var FENCE_RE = /^```/;

function appendInline(parent, text) {
  // split-based inline parsing: alternate on ** (bold) and ` (code) markers
  var boldParts = text.split('**');
  boldParts.forEach(function (part, i) {
    var isBold = i % 2 === 1;
    var codeParts = part.split('`');
    codeParts.forEach(function (seg, j) {
      var isCode = j % 2 === 1;
      if (seg === '') return;
      if (isCode) {
        var codeEl = document.createElement('code');
        codeEl.textContent = seg;
        parent.appendChild(codeEl);
      } else if (isBold) {
        var b = document.createElement('b');
        b.textContent = seg;
        parent.appendChild(b);
      } else {
        parent.appendChild(document.createTextNode(seg));
      }
    });
  });
}

function renderMarkdown(text) {
  var frag = document.createDocumentFragment();
  if (!text) return frag;

  var lines = text.split('\n');
  var i = 0;

  // frontmatter: --- delimited block at top
  if (lines[0] === '---') {
    var end = -1;
    for (var f = 1; f < lines.length; f++) {
      if (lines[f] === '---') { end = f; break; }
    }
    if (end !== -1) {
      var chipRow = textEl('div', null, 'md-frontmatter');
      for (var f2 = 1; f2 < end; f2++) {
        var fm = lines[f2].match(KV_RE);
        if (fm) {
          chipRow.appendChild(textEl('span', fm[1] + ': ' + fm[2], 'md-chip'));
        } else if (lines[f2].trim() !== '') {
          chipRow.appendChild(textEl('span', lines[f2].trim(), 'md-chip'));
        }
      }
      if (chipRow.firstChild) frag.appendChild(chipRow);
      i = end + 1;
    }
  }

  var checkboxCount = 0;
  var checkedCount = 0;

  function countCheckboxes(from) {
    for (var k = from; k < lines.length; k++) {
      if (CHECKBOX_RE.test(lines[k])) checkboxCount++;
    }
  }

  function makeList(ordered) {
    return textEl(ordered ? 'ol' : 'ul');
  }

  while (i < lines.length) {
    var line = lines[i];

    if (line.trim() === '') { i++; continue; }

    // fenced code block
    if (FENCE_RE.test(line)) {
      var codeLines = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      var pre = document.createElement('pre');
      var codeEl2 = document.createElement('code');
      codeEl2.textContent = codeLines.join('\n');
      pre.appendChild(codeEl2);
      frag.appendChild(pre);
      continue;
    }

    // heading
    var hm = line.match(HEADING_RE);
    if (hm) {
      var hEl = document.createElement('h' + hm[1].length);
      appendInline(hEl, hm[2]);
      frag.appendChild(hEl);
      i++;
      continue;
    }

    // checkbox list run
    if (CHECKBOX_RE.test(line)) {
      var wl = textEl('ul', null, 'wip-list');
      while (i < lines.length && CHECKBOX_RE.test(lines[i])) {
        var cm = lines[i].match(CHECKBOX_RE);
        var done = cm[1].toLowerCase() === 'x';
        checkboxCount++;
        if (done) checkedCount++;
        var li = textEl('li', null, 'wip-item');
        var box = textEl('span', null, 'wip-box' + (done ? ' checked' : ''));
        var txt = textEl('span', null, 'wip-text' + (done ? ' done' : ''));
        appendInline(txt, cm[2]);
        li.appendChild(box);
        li.appendChild(txt);
        wl.appendChild(li);
        i++;
      }
      frag.appendChild(wl);
      continue;
    }

    // list run (bullets / numbered, one level of 2-space nesting)
    if (LIST_RE.test(line)) {
      var listRoot = null;
      var nestedList = null;
      var rootOrdered = null;
      while (i < lines.length && LIST_RE.test(lines[i]) && lines[i].trim() !== '') {
        var lm = lines[i].match(LIST_RE);
        var indent = lm[1].length;
        var ordered = !!lm[2];
        if (!listRoot) {
          rootOrdered = ordered;
          listRoot = makeList(rootOrdered);
          frag.appendChild(listRoot);
        }
        if (indent >= 2) {
          if (!nestedList) {
            nestedList = makeList(ordered);
            var lastLi = listRoot.lastElementChild;
            if (lastLi) lastLi.appendChild(nestedList);
            else listRoot.appendChild(nestedList);
          }
          var nli = textEl('li');
          appendInline(nli, lm[3]);
          nestedList.appendChild(nli);
        } else {
          nestedList = null;
          var rli = textEl('li');
          appendInline(rli, lm[3]);
          listRoot.appendChild(rli);
        }
        i++;
      }
      continue;
    }

    // key: value runs of 3+ -> definition grid
    if (KV_RE.test(line)) {
      var kvLines = [];
      var j = i;
      while (j < lines.length && KV_RE.test(lines[j]) && lines[j].trim() !== '') {
        kvLines.push(lines[j]);
        j++;
      }
      if (kvLines.length >= 3) {
        var dl = textEl('dl', null, 'status-grid');
        kvLines.forEach(function (kvLine) {
          var m = kvLine.match(KV_RE);
          dl.appendChild(textEl('dt', m[1]));
          var dd = textEl('dd');
          appendInline(dd, m[2]);
          dl.appendChild(dd);
        });
        frag.appendChild(dl);
        i = j;
        continue;
      }
    }

    // paragraph: accumulate until blank line or a line starting a new block
    var paraLines = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !HEADING_RE.test(lines[i]) &&
      !FENCE_RE.test(lines[i]) &&
      !LIST_RE.test(lines[i]) &&
      !CHECKBOX_RE.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    var p = document.createElement('p');
    appendInline(p, paraLines.join('\n'));
    frag.appendChild(p);
  }

  return frag;
}
