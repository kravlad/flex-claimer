// The "Issue type" menu: a menu button whose menu holds groups with submenus (one level) and ungrouped items,
// following the WAI-ARIA menu button pattern. A submenu flies out to the right where it fits and expands inline
// below its group otherwise (narrow screens). Labels carry data-i18n, so the page's translation code updates them.
(root => {
  'use strict';

  function element(tag, attributes = {}, text) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function labelSpan(text) {
    const span = element('span', {class: 'menu-label', 'data-i18n': ''}, text);
    return span;
  }

  // container: element to render into. input: the field holding the selected key; it gets a "change" event on
  // selection. labelId: id of the visible field label. tree: [{label, items: [{key, label}]} | {key, label}].
  function create({container, input, labelId, tree}) {
    const button = element('button', {type: 'button', id: 'typeButton', class: 'type-button', 'aria-haspopup': 'menu',
      'aria-expanded': 'false', 'aria-controls': 'typeMenuList', 'aria-labelledby': `${labelId} typeButtonText`});
    button.append(element('span', {id: 'typeButtonText', class: 'type-button-text'}), element('span', {class: 'type-caret', 'aria-hidden': 'true'}, '▾'));

    const menu = element('ul', {role: 'menu', id: 'typeMenuList', class: 'menu', 'aria-labelledby': labelId});
    menu.hidden = true;
    const leaves = [];
    const groupButtons = [];
    tree.forEach((node, index) => {
      const item = element('li', {role: 'none'});
      if (node.items) {
        const groupButton = element('button', {type: 'button', role: 'menuitem', id: `typeGroup${index}`, class: 'menu-entry menu-group',
          'aria-haspopup': 'menu', 'aria-expanded': 'false', tabindex: '-1'});
        groupButton.append(labelSpan(node.label), element('span', {class: 'menu-arrow', 'aria-hidden': 'true'}, '›'));
        const submenu = element('ul', {role: 'menu', class: 'menu submenu', 'aria-labelledby': groupButton.id});
        submenu.hidden = true;
        for (const leaf of node.items) submenu.append(leafItem(leaf));
        item.append(groupButton, submenu);
        groupButtons.push(groupButton);
      } else {
        item.append(leafItem(node).firstChild);
      }
      menu.append(item);
    });
    container.append(button, menu);

    function leafItem({key, label}) {
      const item = element('li', {role: 'none'});
      const leaf = element('button', {type: 'button', role: 'menuitemradio', class: 'menu-entry menu-item', 'aria-checked': 'false',
        'data-key': key, tabindex: '-1'});
      leaf.append(labelSpan(label));
      leaves.push(leaf);
      item.append(leaf);
      return item;
    }

    const submenuOf = groupButton => groupButton.nextElementSibling;
    const entriesOf = list => [...list.children].map(item => item.firstElementChild);
    const isOpen = () => !menu.hidden;

    function openMenu(focus) {
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      const entries = entriesOf(menu);
      if (focus === 'first') entries[0].focus();
      if (focus === 'last') entries[entries.length - 1].focus();
    }

    function closeMenu(focusButton) {
      for (const groupButton of groupButtons) closeSubmenu(groupButton);
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (focusButton) button.focus();
    }

    // Flies out to the right when there is room for it, otherwise expands inline under the group.
    function openSubmenu(groupButton, focusFirst) {
      for (const other of groupButtons) if (other !== groupButton) closeSubmenu(other);
      const submenu = submenuOf(groupButton);
      submenu.classList.remove('submenu-inline');
      submenu.hidden = false;
      if (submenu.getBoundingClientRect().right > document.documentElement.clientWidth - 8) submenu.classList.add('submenu-inline');
      groupButton.setAttribute('aria-expanded', 'true');
      if (focusFirst) entriesOf(submenu)[0].focus();
    }

    function closeSubmenu(groupButton) {
      submenuOf(groupButton).hidden = true;
      groupButton.setAttribute('aria-expanded', 'false');
    }

    function select(key) {
      input.value = key;
      input.dispatchEvent(new Event('change', {bubbles: true}));
      closeMenu(true);
    }

    // Marks the selected item and its group; call after the input value changes.
    function sync() {
      for (const leaf of leaves) leaf.setAttribute('aria-checked', String(leaf.dataset.key === input.value));
      for (const groupButton of groupButtons) {
        groupButton.classList.toggle('has-selected', !!submenuOf(groupButton).querySelector('[aria-checked="true"]'));
      }
    }

    button.addEventListener('click', () => isOpen() ? closeMenu(false) : openMenu('first'));
    button.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openMenu(event.key === 'ArrowDown' ? 'first' : 'last');
      }
    });

    menu.addEventListener('click', event => {
      const entry = event.target.closest('.menu-entry');
      if (!entry) return;
      if (entry.classList.contains('menu-group')) {
        const open = entry.getAttribute('aria-expanded') === 'true';
        if (open) closeSubmenu(entry);
        else openSubmenu(entry, event.detail === 0); // detail 0: activated by keyboard, so move focus into it
      } else {
        select(entry.dataset.key);
      }
    });

    menu.addEventListener('keydown', event => {
      const entry = event.target.closest('.menu-entry');
      if (!entry) return;
      const list = entry.closest('ul');
      const entries = entriesOf(list);
      const index = entries.indexOf(entry);
      const inSubmenu = list !== menu;
      const parentGroup = inSubmenu ? list.previousElementSibling : null;
      const move = target => { event.preventDefault(); target.focus(); };
      switch (event.key) {
        case 'ArrowDown': move(entries[(index + 1) % entries.length]); break;
        case 'ArrowUp': move(entries[(index - 1 + entries.length) % entries.length]); break;
        case 'Home': move(entries[0]); break;
        case 'End': move(entries[entries.length - 1]); break;
        case 'ArrowRight':
          if (entry.classList.contains('menu-group')) { event.preventDefault(); openSubmenu(entry, true); }
          break;
        case 'ArrowLeft':
          if (inSubmenu) { event.preventDefault(); closeSubmenu(parentGroup); parentGroup.focus(); }
          break;
        case 'Escape':
          event.preventDefault();
          if (inSubmenu) { closeSubmenu(parentGroup); parentGroup.focus(); } else closeMenu(true);
          break;
        case 'Tab': closeMenu(false); break;
      }
    });

    // With a mouse, hovering a group opens its fly-out submenu; inline submenus open on click only.
    menu.addEventListener('pointerover', event => {
      if (event.pointerType !== 'mouse') return;
      const entry = event.target.closest('.menu-entry');
      if (!entry || entry.closest('ul') !== menu) return;
      if (entry.classList.contains('menu-group')) {
        if (entry.getAttribute('aria-expanded') !== 'true') {
          openSubmenu(entry, false);
          if (submenuOf(entry).classList.contains('submenu-inline')) closeSubmenu(entry);
        }
      } else {
        for (const groupButton of groupButtons) {
          if (!submenuOf(groupButton).classList.contains('submenu-inline')) closeSubmenu(groupButton);
        }
      }
    });

    document.addEventListener('pointerdown', event => {
      if (isOpen() && !container.contains(event.target)) closeMenu(false);
    });

    input.addEventListener('change', sync);
    return {sync, firstKey: leaves[0].dataset.key};
  }

  root.FlexTypeMenu = {create};
})(window);
