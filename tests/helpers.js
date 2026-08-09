// Fake SVG element: only what the shape converters read.
// ponytail: two methods are enough — nothing here touches the real DOM.
export const el = (attrs, tag = 'path') => ({
  tagName: tag,
  getAttribute: k => (k in attrs ? String(attrs[k]) : null),
  hasAttribute: k => k in attrs
})
