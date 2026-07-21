'use strict';

var state = {
  overview: null,
  serialized: { status: '', wip: '', pages: '', sessions: '', audit: '', index: '' },
  activePage: null,
  linksFetchedAt: 0,
  pollFailed: false,
  refreshedAt: null,
  graphRows: [],
  seenActivityKeys: null,
  schemaTables: [],
  schemaFetchedAt: 0,
};

function qs(id) { return document.getElementById(id); }

function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function textEl(tag, text, className) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}
