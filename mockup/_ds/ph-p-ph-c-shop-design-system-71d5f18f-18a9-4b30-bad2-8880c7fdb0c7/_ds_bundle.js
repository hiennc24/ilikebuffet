/* @ds-bundle: {"format":3,"namespace":"PhPPhCShopDesignSystem_71d5f1","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Divider","sourcePath":"components/core/Divider.jsx"},{"name":"Hangtag","sourcePath":"components/retail/Hangtag.jsx"},{"name":"MaterialSwatch","sourcePath":"components/retail/MaterialSwatch.jsx"},{"name":"ProductCard","sourcePath":"components/retail/ProductCard.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"f6ef0bd11c3d","components/core/Button.jsx":"ea0fe0427296","components/core/Card.jsx":"f4a0d7259e73","components/core/Divider.jsx":"96ba93a1c0b5","components/retail/Hangtag.jsx":"051e276bc8a1","components/retail/MaterialSwatch.jsx":"c0ae0ebb7bef","components/retail/ProductCard.jsx":"8083a03d112b","ui_kits/website/cart.js":"a99dacb817ca","ui_kits/website/reveal.js":"0bcbfe580781","ui_kits/website/shop-data.js":"f851efa72799"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.PhPPhCShopDesignSystem_71d5f1 = window.PhPPhCShopDesignSystem_71d5f1 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — small status / category marker.
 * Tones map to the brand palette; default is a soft lam wash.
 */
function Badge({
  children,
  tone = 'lam',
  variant = 'soft',
  ...rest
}) {
  const tones = {
    lam: {
      soft: ['var(--lam-200)', 'var(--lam-700)'],
      solid: ['var(--lam-500)', 'var(--plaster-50)']
    },
    nau: {
      soft: ['#E6D8C8', 'var(--nau-600)'],
      solid: ['var(--nau-600)', 'var(--plaster-50)']
    },
    oak: {
      soft: ['#EADCC4', 'var(--oak-500)'],
      solid: ['var(--oak-500)', 'var(--plaster-50)']
    },
    ink: {
      soft: ['var(--plaster-200)', 'var(--ink-900)'],
      solid: ['var(--ink-900)', 'var(--plaster-50)']
    }
  };
  const [bg, fg] = tones[tone][variant];
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-2xs)',
      fontWeight: 'var(--fw-medium)',
      letterSpacing: 'var(--tracking-wide)',
      textTransform: 'uppercase',
      padding: '4px 10px',
      borderRadius: 'var(--radius-full)',
      background: bg,
      color: fg,
      lineHeight: 1.2
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — Pháp Phục Shop
 * Quiet, architectural button. Filled uses the áo-lam smoke teal;
 * outline and ghost stay restrained. Wide tracking on labels.
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  as = 'button',
  ...rest
}) {
  const pads = {
    sm: '8px 18px',
    md: '12px 28px',
    lg: '16px 40px'
  };
  const fontSizes = {
    sm: '0.75rem',
    md: '0.8125rem',
    lg: '0.875rem'
  };
  const base = {
    fontFamily: 'var(--font-sans)',
    fontWeight: 'var(--fw-medium)',
    fontSize: fontSizes[size],
    letterSpacing: 'var(--tracking-wider)',
    textTransform: 'uppercase',
    padding: pads[size],
    borderRadius: 'var(--radius-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    width: fullWidth ? '100%' : 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    transition: 'background var(--dur-base) var(--ease-calm), color var(--dur-base) var(--ease-calm), border-color var(--dur-base) var(--ease-calm)',
    lineHeight: 1,
    textDecoration: 'none'
  };
  const variants = {
    primary: {
      background: 'var(--lam-500)',
      color: 'var(--plaster-50)',
      border: '1px solid var(--lam-500)'
    },
    secondary: {
      background: 'transparent',
      color: 'var(--ink-900)',
      border: '1px solid var(--line-strong)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--ink-700)',
      border: '1px solid transparent'
    },
    dark: {
      background: 'var(--ink-900)',
      color: 'var(--plaster-50)',
      border: '1px solid var(--ink-900)'
    }
  };
  const Tag = as;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    style: {
      ...base,
      ...variants[variant]
    },
    disabled: as === 'button' ? disabled : undefined
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — soft warm surface container.
 * `arch` adds the brand's signature arched top (doorway motif).
 */
function Card({
  children,
  elevation = 'sm',
  arch = false,
  padded = true,
  style = {},
  ...rest
}) {
  const shadows = {
    flat: 'none',
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)'
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--bg-raised)',
      border: '1px solid var(--line)',
      borderRadius: arch ? '140px 140px var(--radius-md) var(--radius-md)' : 'var(--radius-lg)',
      boxShadow: shadows[elevation],
      padding: padded ? 'var(--space-5)' : 0,
      overflow: 'hidden',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Divider.jsx
try { (() => {
/**
 * Divider — quiet hairline separator.
 * `ornament` centres a small diamond, a calm sectioning mark.
 */
function Divider({
  orientation = 'horizontal',
  ornament = false,
  style = {}
}) {
  if (orientation === 'vertical') {
    return /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-block',
        width: '1px',
        alignSelf: 'stretch',
        background: 'var(--line-strong)',
        ...style
      }
    });
  }
  if (ornament) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        color: 'var(--line-strong)',
        ...style
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: '1px',
        background: 'var(--line-strong)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        width: '6px',
        height: '6px',
        transform: 'rotate(45deg)',
        background: 'var(--oak-400)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: '1px',
        background: 'var(--line-strong)'
      }
    }));
  }
  return /*#__PURE__*/React.createElement("hr", {
    style: {
      border: 0,
      borderTop: '1px solid var(--line)',
      margin: 0,
      ...style
    }
  });
}
Object.assign(__ds_scope, { Divider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Divider.jsx", error: String((e && e.message) || e) }); }

// components/retail/Hangtag.jsx
try { (() => {
/**
 * Hangtag — the swing tag tied to each garment.
 * A small, tactile brand artdefact: wordmark, product, fabric, size, price.
 */
function Hangtag({
  product = 'Áo tràng lam',
  fabric = 'Vải lanh',
  size = 'M',
  price = '650.000₫',
  code = 'PP·01'
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '210px',
      background: 'var(--plaster-50)',
      border: '1px solid var(--line-strong)',
      borderRadius: 'var(--radius-md)',
      padding: '22px 20px 20px',
      fontFamily: 'var(--font-sans)',
      position: 'relative',
      boxShadow: 'var(--shadow-sm)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      border: '1.5px solid var(--ink-500)',
      background: 'var(--bg-page)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginTop: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: '1.5rem',
      lineHeight: 1,
      color: 'var(--ink-900)'
    }
  }, "Ph\xE1p\xA0Ph\u1EE5c"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '0.5rem',
      letterSpacing: 'var(--tracking-widest)',
      textTransform: 'uppercase',
      color: 'var(--ink-500)',
      marginTop: '5px'
    }
  }, "An nhi\xEAn \xB7 T\u1ECBnh t\xE2m")), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid var(--line)',
      margin: '16px 0 14px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '9px'
    }
  }, /*#__PURE__*/React.createElement(Row, {
    label: "S\u1EA3n ph\u1EA9m",
    value: product
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Ch\u1EA5t li\u1EC7u",
    value: fabric
  }), /*#__PURE__*/React.createElement(Row, {
    label: "K\xEDch c\u1EE1",
    value: size
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: '16px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '0.5625rem',
      letterSpacing: 'var(--tracking-wide)',
      color: 'var(--text-muted)'
    }
  }, code), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: '1.375rem',
      color: 'var(--lam-700)'
    }
  }, price)));
}
function Row({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '0.5625rem',
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-wider)',
      color: 'var(--text-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '0.8125rem',
      color: 'var(--ink-900)',
      textAlign: 'right'
    }
  }, value));
}
Object.assign(__ds_scope, { Hangtag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/retail/Hangtag.jsx", error: String((e && e.message) || e) }); }

// components/retail/MaterialSwatch.jsx
try { (() => {
/**
 * MaterialSwatch — a physical-finish chip for spec boards & floor plans.
 * Renders one of the shop's real materials with a label.
 */
function MaterialSwatch({
  material = 'plaster',
  label,
  caption,
  size = 'md',
  selected = false
}) {
  const fills = {
    plaster: 'var(--mat-plaster)',
    oak: 'var(--mat-oak)',
    burl: 'var(--mat-burl)',
    walnut: 'var(--mat-walnut)',
    terrazzo: 'var(--mat-terrazzo)',
    steel: 'var(--mat-steel)',
    brass: 'var(--mat-brass)',
    floor: 'var(--mat-floor)'
  };
  const dims = {
    sm: 56,
    md: 80,
    lg: 112
  };
  const d = dims[size];
  const isTerrazzo = material === 'terrazzo';
  return /*#__PURE__*/React.createElement("figure", {
    style: {
      margin: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      width: d + 'px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: d + 'px',
      height: d + 'px',
      borderRadius: 'var(--radius-md)',
      background: fills[material],
      backgroundSize: isTerrazzo ? 'var(--mat-terrazzo-size)' : 'auto',
      border: selected ? '2px solid var(--ink-900)' : '1px solid rgba(43,35,27,0.12)',
      boxShadow: 'var(--shadow-inset)'
    }
  }), (label || caption) && /*#__PURE__*/React.createElement("figcaption", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px'
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-xs)',
      fontWeight: 'var(--fw-medium)',
      color: 'var(--ink-900)',
      letterSpacing: 'var(--tracking-wide)'
    }
  }, label), caption && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-2xs)',
      color: 'var(--text-muted)'
    }
  }, caption)));
}
Object.assign(__ds_scope, { MaterialSwatch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/retail/MaterialSwatch.jsx", error: String((e && e.message) || e) }); }

// components/retail/ProductCard.jsx
try { (() => {
/**
 * ProductCard — a garment in a lookbook or e-commerce grid.
 * Calm, gallery-like: generous image, serif name, quiet meta.
 */
function ProductCard({
  image,
  name = 'Áo tràng lam',
  fabric = 'Vải lanh',
  price = '650.000₫',
  badge,
  arch = true
}) {
  return /*#__PURE__*/React.createElement("article", {
    style: {
      width: '260px',
      fontFamily: 'var(--font-sans)',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      aspectRatio: '3 / 4',
      background: image ? `center/cover no-repeat url("${image}")` : 'var(--mat-plaster)',
      borderRadius: arch ? '130px 130px var(--radius-md) var(--radius-md)' : 'var(--radius-md)',
      overflow: 'hidden',
      border: '1px solid var(--line)'
    }
  }, badge && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: '12px',
      left: '12px',
      background: 'var(--plaster-50)',
      color: 'var(--ink-900)',
      fontSize: 'var(--text-2xs)',
      fontWeight: 'var(--fw-medium)',
      letterSpacing: 'var(--tracking-wide)',
      textTransform: 'uppercase',
      padding: '4px 10px',
      borderRadius: 'var(--radius-full)'
    }
  }, badge)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: '1.375rem',
      fontWeight: 'var(--fw-medium)',
      lineHeight: 1.1,
      color: 'var(--ink-900)'
    }
  }, name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: '1.125rem',
      color: 'var(--lam-700)',
      whiteSpace: 'nowrap'
    }
  }, price)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      letterSpacing: 'var(--tracking-wide)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)'
    }
  }, fabric)));
}
Object.assign(__ds_scope, { ProductCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/retail/ProductCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/cart.js
try { (() => {
/* ============================================================
   Pháp Phục — shopping cart (localStorage, cross-page)
   Requires shop-data.js (window.PP / PP_PRODUCTS) on the page.
   ============================================================ */
(function () {
  var KEY = 'pp_cart_v1';
  var PP = window.PP;
  function get() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function save(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    updateBadge();
  }
  var Cart = {
    items: get,
    count: function () {
      return get().reduce(function (n, it) {
        return n + it.qty;
      }, 0);
    },
    total: function () {
      return get().reduce(function (s, it) {
        var p = PP.byId(it.id);
        return s + (p ? p.price * it.qty : 0);
      }, 0);
    },
    add: function (id, size, qty) {
      qty = qty || 1;
      size = size || 'M';
      var items = get();
      var ex = items.find(function (it) {
        return it.id === id && it.size === size;
      });
      if (ex) ex.qty += qty;else items.push({
        id: id,
        size: size,
        qty: qty
      });
      save(items);
      toast('Đã thêm vào giỏ');
    },
    setQty: function (i, qty) {
      var items = get();
      if (!items[i]) return;
      items[i].qty = Math.max(1, qty);
      save(items);
    },
    remove: function (i) {
      var items = get();
      items.splice(i, 1);
      save(items);
    },
    clear: function () {
      save([]);
    }
  };
  window.PPCart = Cart;

  /* ---- nav badge ---- */
  function updateBadge() {
    var n = Cart.count();
    document.querySelectorAll('.pp-cart-count').forEach(function (el) {
      el.textContent = n;
      el.style.display = n > 0 ? '' : 'none';
    });
  }
  function injectNav() {
    var nav = document.querySelector('.nav-inner');
    if (!nav || nav.querySelector('.pp-cart-link')) return;
    var contact = nav.querySelector('a.btn');
    var link = document.createElement('a');
    link.className = 'pp-cart-link';
    link.href = 'gio-hang.html';
    link.setAttribute('aria-label', 'Giỏ hàng');
    link.innerHTML = 'Giỏ <span class="pp-cart-count">0</span>';
    if (contact) nav.insertBefore(link, contact);else nav.appendChild(link);
    updateBadge();
  }

  /* ---- toast ---- */
  var toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'pp-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 2200);
  }

  /* ---- cart page render ---- */
  function renderCartPage() {
    var root = document.getElementById('cart-root');
    if (!root) return;
    var items = get();
    if (!items.length) {
      root.innerHTML = '<div class="cart-empty">' + '<p class="serif" style="font-size:2rem;color:var(--ink-900);margin:0 0 14px">Giỏ hàng đang trống</p>' + '<p class="muted" style="margin:0 0 26px">Hãy chọn cho mình một bộ pháp phục an nhiên.</p>' + '<a class="btn btn-primary" href="san-pham.html">Xem sản phẩm</a>' + '</div>';
      return;
    }
    var rows = items.map(function (it, i) {
      var p = PP.byId(it.id);
      if (!p) return '';
      return '<div class="cart-row">' + '<div class="cart-thumb" style="background:' + p.tone + '">' + '<img src="' + PP.assets + p.id + '.jpg" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()">' + '<span class="cart-thumb-lbl">' + p.label + '</span>' + '</div>' + '<div class="cart-meta"><div class="cart-name serif">' + p.name + '</div>' + '<div class="muted" style="font-size:var(--text-sm)">' + p.fabric + ' · Size ' + it.size + '</div>' + '<button class="cart-remove" data-i="' + i + '">Xoá</button></div>' + '<div class="cart-qty">' + '<button data-act="dec" data-i="' + i + '">−</button>' + '<span>' + it.qty + '</span>' + '<button data-act="inc" data-i="' + i + '">+</button>' + '</div>' + '<div class="cart-line-price serif">' + PP.vnd(p.price * it.qty) + '</div>' + '</div>';
    }).join('');
    var total = Cart.total();
    root.innerHTML = '<div class="cart-grid">' + '<div class="cart-lines">' + rows + '</div>' + '<aside class="cart-summary">' + '<h3 class="serif">Tóm tắt đơn</h3>' + '<div class="cart-sum-row"><span>Tạm tính</span><span>' + PP.vnd(total) + '</span></div>' + '<div class="cart-sum-row"><span>Phí giao</span><span>Tính khi thanh toán</span></div>' + '<div class="cart-sum-row total"><span>Tổng</span><span>' + PP.vnd(total) + '</span></div>' + '<button class="btn btn-primary" style="width:100%;margin-top:18px" onclick="alert(\'Đây là bản mẫu — thanh toán chưa được kết nối.\')">Tiến hành thanh toán</button>' + '<a class="btn btn-ghost" style="width:100%;justify-content:center;margin-top:8px" href="san-pham.html">Tiếp tục mua</a>' + '</aside>' + '</div>';
    root.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.getAttribute('data-i');
        var cur = get()[i].qty;
        Cart.setQty(i, b.getAttribute('data-act') === 'inc' ? cur + 1 : cur - 1);
        renderCartPage();
      });
    });
    root.querySelectorAll('.cart-remove').forEach(function (b) {
      b.addEventListener('click', function () {
        Cart.remove(+b.getAttribute('data-i'));
        renderCartPage();
      });
    });
  }
  window.PPRenderCart = renderCartPage;
  document.addEventListener('DOMContentLoaded', function () {
    injectNav();
    renderCartPage();
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/cart.js", error: String((e && e.message) || e) }); }

// ui_kits/website/reveal.js
try { (() => {
// Pháp Phục — reveal-on-scroll (progressive enhancement)
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return; // leave everything visible
  document.body.classList.add('js');
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -8% 0px'
  });
  document.querySelectorAll('.reveal').forEach(function (e) {
    io.observe(e);
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/reveal.js", error: String((e && e.message) || e) }); }

// ui_kits/website/shop-data.js
try { (() => {
/* ============================================================
   Pháp Phục — product data (single source of truth)
   Real photos: drop files in  assets/products/<id>.jpg
   They appear automatically; until then a soft fabric tile shows.
   ============================================================ */
window.PP_PRODUCTS = [{
  id: 'ao-trang-lam',
  name: 'Áo tràng lam',
  cat: 'ao-trang',
  fabric: 'Vải lanh thô',
  price: 650000,
  badge: 'Mới',
  tone: 'var(--mat-plaster)',
  label: 'Áo tràng'
}, {
  id: 'ao-trang-nga',
  name: 'Áo tràng trắng ngà',
  cat: 'ao-trang',
  fabric: 'Đũi tự nhiên',
  price: 690000,
  badge: '',
  tone: 'linear-gradient(165deg,#EFE7D7,#DCCCB2)',
  label: 'Áo tràng'
}, {
  id: 'ao-lam-lung',
  name: 'Áo lam tay lửng',
  cat: 'ao-lam',
  fabric: 'Cotton mộc',
  price: 480000,
  badge: '',
  tone: 'linear-gradient(165deg,#D3DAD6,#AEBDB7)',
  label: 'Áo lam'
}, {
  id: 'ao-lam-tron',
  name: 'Áo lam cổ tròn',
  cat: 'ao-lam',
  fabric: 'Lanh pha',
  price: 450000,
  badge: 'Bán chạy',
  tone: 'linear-gradient(165deg,#C3CCC7,#9FB0AB)',
  label: 'Áo lam'
}, {
  id: 'quan-suong',
  name: 'Quần ống suông',
  cat: 'quan',
  fabric: 'Đũi tự nhiên',
  price: 420000,
  badge: '',
  tone: 'linear-gradient(165deg,#EFE7D7,#DCCCB2)',
  label: 'Quần'
}, {
  id: 'quan-nau',
  name: 'Quần nâu sồng',
  cat: 'quan',
  fabric: 'Lanh nhuộm',
  price: 440000,
  badge: '',
  tone: 'linear-gradient(165deg,#D8C9B8,#B49B83)',
  label: 'Quần'
}, {
  id: 'khan-van',
  name: 'Khăn vấn nâu sồng',
  cat: 'phu-kien',
  fabric: 'Lanh nhuộm chàm',
  price: 180000,
  badge: 'Thủ công',
  tone: 'linear-gradient(165deg,#D8C9B8,#B49B83)',
  label: 'Khăn'
}, {
  id: 'tui-kinh',
  name: 'Túi vải đựng kinh',
  cat: 'phu-kien',
  fabric: 'Canvas cotton',
  price: 160000,
  badge: '',
  tone: 'var(--mat-plaster)',
  label: 'Túi'
}];
window.PP = {
  base: '',
  // set per-page if needed; default same folder
  assets: '../../assets/products/',
  vnd: function (n) {
    return n.toLocaleString('vi-VN') + '₫';
  },
  byId: function (id) {
    return (window.PP_PRODUCTS || []).find(function (p) {
      return p.id === id;
    });
  },
  // inner HTML for a .prod-media box (real <img> with fabric-tile fallback)
  mediaInner: function (p) {
    var img = this.assets + p.id + '.jpg';
    var badge = p.badge ? '<span class="prod-badge">' + p.badge + '</span>' : '';
    return badge + '<img src="' + img + '" alt="' + p.name + '" loading="lazy" ' + 'style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1" ' + 'onerror="this.remove()">' + '<div class="placeholder"><span>' + p.label + '</span></div>';
  },
  cardHTML: function (p) {
    return '<a class="prod" data-cat="' + p.cat + '" href="chi-tiet-san-pham.html?id=' + p.id + '">' + '<div class="prod-media" style="background:' + p.tone + '">' + this.mediaInner(p) + '</div>' + '<div class="prod-info"><span class="prod-name">' + p.name + '</span>' + '<span class="prod-price">' + this.vnd(p.price) + '</span></div>' + '<span class="prod-fabric">' + p.fabric + '</span></a>';
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/shop-data.js", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Divider = __ds_scope.Divider;

__ds_ns.Hangtag = __ds_scope.Hangtag;

__ds_ns.MaterialSwatch = __ds_scope.MaterialSwatch;

__ds_ns.ProductCard = __ds_scope.ProductCard;

})();
