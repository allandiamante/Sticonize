export const el = (attrs, tag = 'path') => ({
  tagName: tag,
  getAttribute: k => (k in attrs ? String(attrs[k]) : null),
  hasAttribute: k => k in attrs
})
