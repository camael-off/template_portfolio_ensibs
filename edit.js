// ----------------------------------------------------------------
// Mode édition dans le navigateur, pour remplir le template sans
// toucher au code HTML.
//
// - Rend tout le contenu de <main> éditable (pas seulement les ".fill") :
//   nom, intitulés, textes libres , un même template doit pouvoir servir
//   à un autre étudiant, une autre formation, un autre nombre d'années.
// - Duplique/supprime les blocs délimités par <!-- DUPLIQUER -->
//   .. <!-- /DUPLIQUER --> (cartes d'activité, lignes de frise/preuves,
//   vignettes média, cartes "parcourir par année"), sans jamais
//   copier/coller de HTML à la main.
// - Permet d'ajouter une image sur un placeholder "Notes & médias".
// - Ajoute/retire des pages année depuis les onglets de la sidebar
//   (.year-tabs, partagés entre les 4 pages via localStorage) ; ajouter
//   une année télécharge aussi un .html de départ pour cette page.
// - Sauvegarde automatiquement le contenu de <main> dans localStorage
//   (filet de sécurité en cas de fermeture accidentelle de l'onglet).
// - "Télécharger le portfolio" exporte la page actuelle (avec les
//   modifications) en un fichier .html autonome, qui reste éditable.
//
// IMPORTANT : la restauration depuis localStorage se fait ICI, en haut
// de ce fichier, donc AVANT que les scripts plus haut dans la page
// n'écoutent "DOMContentLoaded" (ce script est chargé juste avant
// </body>, mais son code de premier niveau s'exécute pendant le
// parsing, donc avant l'événement DOMContentLoaded). Ainsi, quand le
// script de notation/radar/complétion se déclenche, il voit déjà le
// contenu restauré (cartes dupliquées incluses) et s'y attache
// normalement.
(function () {
  "use strict";

  var main = document.getElementById("main-content");
  if (!main) return;

  function storageKey() {
    var name = location.pathname.split("/").pop() || "index.html";
    return "eportfolio-content-" + name.replace(/\.html$/, "");
  }

  function restoreContent() {
    try {
      var saved = localStorage.getItem(storageKey());
      if (saved) main.innerHTML = saved;
    } catch (e) { /* localStorage indisponible : on garde le contenu du fichier */ }
  }
  restoreContent();

  // ---- Liste des années (onglets .year-tabs), partagée entre les 4 pages ----
  // Comme pour le contenu de <main>, la restauration se fait ici, avant
  // DOMContentLoaded, pour que le script du radar de index.html (qui lit
  // ces onglets pour savoir combien d'années superposer) voie déjà la
  // bonne liste.
  var YEAR_TABS_KEY = "eportfolio-year-tabs";
  var yearTabs = document.querySelector(".year-tabs");
  var currentFile = location.pathname.split("/").pop() || "index.html";

  function markActiveTab() {
    if (!yearTabs) return;
    yearTabs.querySelectorAll("a").forEach(function (a) {
      var isActive = a.getAttribute("href") === currentFile;
      a.classList.toggle("active", isActive);
      if (isActive) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function restoreYearTabs() {
    if (!yearTabs) return;
    try {
      var saved = localStorage.getItem(YEAR_TABS_KEY);
      if (saved) yearTabs.innerHTML = saved;
    } catch (e) { /* on garde les onglets du fichier */ }
    markActiveTab();
  }
  restoreYearTabs();

  // ---- Logo d'entreprise (.brand-logo), partagé entre les 4 pages ----
  // Le template ne fournit plus de logo d'entreprise par défaut : chacun
  // importe le sien (stocké en data URL, comme les images de la galerie).
  var BRAND_LOGO_KEY = "eportfolio-brand-logo";
  var brandLogo = document.querySelector(".brand-logo");

  function restoreBrandLogo() {
    if (!brandLogo) return;
    try {
      var saved = localStorage.getItem(BRAND_LOGO_KEY);
      if (saved) brandLogo.innerHTML = '<img src="' + saved + '" alt="Logo entreprise">';
    } catch (e) { /* on garde le placeholder */ }
  }
  restoreBrandLogo();

  function bindBrandLogo() {
    if (!brandLogo || bound.has(brandLogo)) return;
    bound.add(brandLogo);
    brandLogo.addEventListener("click", function () {
      if (!editing) return;
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.addEventListener("change", function () {
        var file = input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          brandLogo.innerHTML = '<img src="' + reader.result + '" alt="Logo entreprise">';
          try { localStorage.setItem(BRAND_LOGO_KEY, reader.result); } catch (e) {}
        };
        reader.readAsDataURL(file);
      });
      input.click();
    });
  }

  function saveYearTabs() {
    if (!yearTabs) return;
    var clone = yearTabs.cloneNode(true);
    clone.querySelectorAll(".app-injected").forEach(function (el) { el.remove(); });
    clone.querySelectorAll("[contenteditable]").forEach(function (el) { el.removeAttribute("contenteditable"); });
    try { localStorage.setItem(YEAR_TABS_KEY, clone.innerHTML); } catch (e) {}
  }

  var saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(storageKey(), main.innerHTML); } catch (e) {}
    }, 500);
  }

  var editing = false;

  // Marque les éléments déjà "branchés" en mémoire (jamais sauvegardé/restauré,
  // contrairement à un data-attribute, qui lui finirait dans le HTML persisté
  // et empêcherait de ré-attacher les écouteurs après un rechargement de page).
  var bound = new WeakSet();

  // ---- Zones de texte éditables (.fill / .fill-block) ----
  function bindFillElement(el) {
    if (bound.has(el)) return;
    bound.add(el);
    el.contentEditable = editing ? "true" : "false";
    el.addEventListener("input", function () {
      el.classList.remove("fill", "fill-block");
      if (typeof window.updateCompletion === "function") window.updateCompletion();
      scheduleSave();
    });
  }

  // ---- Upload d'image sur un placeholder "Notes & médias" ----
  function bindResizeHandle(wrap, dir) {
    var h = document.createElement("span");
    h.className = "resize-handle resize-handle-" + dir;
    h.addEventListener("click", function (e) { e.stopPropagation(); });
    h.addEventListener("mousedown", function (e) {
      if (!editing) return;
      e.preventDefault();
      e.stopPropagation();
      var startX = e.clientX, startY = e.clientY;
      var startW = wrap.offsetWidth, startH = wrap.offsetHeight;
      function onMove(e2) {
        if (dir.indexOf("e") > -1) wrap.style.width = Math.max(40, startW + (e2.clientX - startX)) + "px";
        if (dir.indexOf("s") > -1) wrap.style.height = Math.max(40, startH + (e2.clientY - startY)) + "px";
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        scheduleSave();
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
    wrap.appendChild(h);
  }

  function createResizableWrap(dataUrl) {
    var wrap = document.createElement("div");
    wrap.className = "media-resize-wrap";
    wrap.contentEditable = "false";
    wrap.style.width = "320px";
    wrap.style.height = "220px";
    var img = document.createElement("img");
    img.src = dataUrl;
    img.alt = "";
    wrap.appendChild(img);
    ["e", "s", "se"].forEach(function (dir) { bindResizeHandle(wrap, dir); });
    return wrap;
  }

  function insertImageFile(placeholder, file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      placeholder.innerHTML = "";
      placeholder.appendChild(createResizableWrap(reader.result));
      scheduleSave();
    };
    reader.readAsDataURL(file);
  }

  // ---- Collage d'une image n'importe où dans le texte éditable ----
  function bindTextPasteImage(main) {
    main.addEventListener("paste", function (e) {
      if (!editing || e.defaultPrevented) return;
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image/") === 0) {
          e.preventDefault();
          var file = items[i].getAsFile();
          var reader = new FileReader();
          reader.onload = function () {
            var wrap = createResizableWrap(reader.result);
            var sel = window.getSelection();
            if (sel && sel.rangeCount) {
              var range = sel.getRangeAt(0);
              range.deleteContents();
              range.insertNode(wrap);
              range.setStartAfter(wrap);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            } else {
              main.appendChild(wrap);
            }
            scheduleSave();
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    });
  }

  function bindImageUpload(placeholder) {
    if (bound.has(placeholder)) return;
    bound.add(placeholder);
    placeholder.contentEditable = "false"; // clic = upload, pas de saisie de texte
    placeholder.tabIndex = 0; // pour pouvoir coller (Ctrl+V) au focus
    placeholder.addEventListener("click", function () {
      if (!editing) return;
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.addEventListener("change", function () {
        insertImageFile(placeholder, input.files[0]);
      });
      input.click();
    });
    placeholder.addEventListener("paste", function (e) {
      if (!editing) return;
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image/") === 0) {
          e.preventDefault();
          insertImageFile(placeholder, items[i].getAsFile());
          return;
        }
      }
    });
  }

  // ---- Suppression d'un bloc dupliqué (ou de la carte modèle) ----
  function bindDeleteButton(btn) {
    if (bound.has(btn)) return;
    bound.add(btn);
    btn.addEventListener("click", function () {
      var host = btn.closest(".dup-deletable");
      if (host && confirm("Supprimer ce bloc ?")) {
        host.remove();
        if (typeof window.updateCompletion === "function") window.updateCompletion();
        scheduleSave();
      }
    });
  }

  function addDeleteButton(el) {
    if (el.classList.contains("dup-deletable")) return;
    el.classList.add("dup-deletable");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "del-btn app-injected";
    btn.title = "Supprimer ce bloc";
    btn.textContent = "✕";
    btn.contentEditable = "false";
    if (el.tagName === "TR") {
      var cell = el.querySelector("td, th");
      if (cell) { cell.style.position = "relative"; cell.appendChild(btn); }
    } else {
      if (getComputedStyle(el).position === "static") el.style.position = "relative";
      el.appendChild(btn);
    }
    bindDeleteButton(btn);
  }

  // ---- Sélecteur d'attributs d'une carte d'activité (cours/entreprise/
  // perso/anonymisé) : affiché seulement en édition, synchronisé avec les
  // badges déjà présents dans la carte (source de vérité = les badges,
  // donc rien à sauvegarder à part eux).
  var ATTR_DEFS = [
    { cls: "badge-cours", label: "Cours" },
    { cls: "badge-ent", label: "Entreprise" },
    { cls: "badge-perso", label: "Travail perso" },
    { cls: "badge-anon", label: "Anonymisé" }
  ];

  function bindAttrPicker(card) {
    var header = card.querySelector(":scope > .activity-header");
    var badgesEl = header && header.querySelector(":scope > .badges");
    if (!badgesEl) return;
    var picker = header.querySelector(":scope > .attr-picker");
    if (!picker) {
      picker = document.createElement("div");
      picker.className = "attr-picker app-injected";
      picker.contentEditable = "false";
      ATTR_DEFS.forEach(function (def) {
        var label = document.createElement("label");
        var input = document.createElement("input");
        input.type = "checkbox";
        input.className = "attr-" + def.cls;
        label.appendChild(input);
        label.appendChild(document.createTextNode(" " + def.label));
        picker.appendChild(label);
      });
      header.insertBefore(picker, badgesEl.nextSibling);
    }
    picker.querySelectorAll("input[type=checkbox]").forEach(function (input, i) {
      var def = ATTR_DEFS[i];
      input.checked = !!badgesEl.querySelector("." + def.cls);
      if (bound.has(input)) return;
      bound.add(input);
      input.addEventListener("change", function () {
        var existing = badgesEl.querySelector("." + def.cls);
        if (input.checked && !existing) {
          var span = document.createElement("span");
          span.className = "badge " + def.cls;
          span.textContent = def.label;
          badgesEl.appendChild(span);
        } else if (!input.checked && existing) {
          existing.remove();
        }
        scheduleSave();
      });
    });
  }

  // ---- Repérage des blocs <!-- DUPLIQUER --> .. <!-- /DUPLIQUER --> ----
  function findDuplicatePairs(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    var stack = [];
    var pairs = [];
    var node;
    while ((node = walker.nextNode())) {
      var text = node.data.trim();
      if (text.indexOf("DUPLIQUER") === 0) {
        stack.push(node);
      } else if (text === "/DUPLIQUER") {
        var start = stack.pop();
        if (start && start.nextElementSibling) {
          pairs.push({ start: start, end: node, element: start.nextElementSibling });
        }
      }
    }
    return pairs;
  }

  // ---- Ajoute (ou retrouve) le bouton "+ Dupliquer ce bloc" ----
  function enhancePair(pair) {
    addDeleteButton(pair.element);

    // Les clones déjà dupliqués (classe "dup-deletable") s'empilent entre
    // le marqueur de fin et le bouton "+ Dupliquer" : il faut les
    // enjamber pour retrouver (ou recréer) ce bouton après un rechargement.
    var node = pair.end.nextElementSibling;
    while (node && node.classList.contains("dup-deletable")) {
      node = node.nextElementSibling;
    }
    var wrapper = (node && node.classList.contains("dup-control")) ? node : null;
    if (!wrapper) {
      var parentTag = pair.end.parentNode.tagName;
      var tag = (parentTag === "OL" || parentTag === "UL") ? "li" : (parentTag === "TBODY") ? "tr" : "div";
      wrapper = document.createElement(tag);
      wrapper.className = "dup-control app-injected";
      wrapper.contentEditable = "false";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dup-add-btn";
      btn.textContent = "+ Dupliquer ce bloc";
      if (tag === "tr") {
        var td = document.createElement("td");
        td.colSpan = pair.element.children.length || 1;
        td.appendChild(btn);
        wrapper.appendChild(td);
      } else {
        wrapper.appendChild(btn);
      }
      pair.end.parentNode.insertBefore(wrapper, node);
    }

    var template = pair.element.cloneNode(true);
    wrapper.querySelector(".dup-add-btn").onclick = function () {
      var clone = template.cloneNode(true);
      wrapper.parentNode.insertBefore(clone, wrapper);
      addDeleteButton(clone);
      enhanceSubtree(clone);
      if (typeof window.updateCompletion === "function") window.updateCompletion();
      scheduleSave();
    };
  }

  // ---- Applique tous les mécanismes ci-dessus à un sous-arbre du DOM ----
  // (appelé une fois pour tout <main> au chargement, puis pour chaque
  // nouveau bloc dupliqué, afin de gérer la duplication imbriquée des
  // vignettes média à l'intérieur d'une carte d'activité.)
  function enhanceSubtree(root) {
    root.querySelectorAll(".fill, .fill-block").forEach(bindFillElement);
    root.querySelectorAll(".media-placeholder").forEach(bindImageUpload);
    root.querySelectorAll("select").forEach(function (s) { s.contentEditable = "false"; });
    root.querySelectorAll(".del-btn").forEach(bindDeleteButton);
    var cards = root.matches && root.matches(".activity-card") ? [root] : [];
    cards = cards.concat(Array.prototype.slice.call(root.querySelectorAll(".activity-card")));
    cards.forEach(bindAttrPicker);
    findDuplicatePairs(root).forEach(enhancePair);
  }

  // ---- Bascule du mode édition ----
  // En édition, tout le contenu de <main> devient éditable (pas seulement
  // les ".fill") : le nom, l'intitulé de formation, les titres et textes
  // qui mentionnent un nombre d'années précis sont aussi à adapter d'un
  // étudiant à l'autre, pas seulement les champs "[À COMPLÉTER]".
  function setEditing(on) {
    editing = on;
    document.body.classList.toggle("is-editing", on);
    main.contentEditable = on ? "true" : "false";
    document.querySelectorAll(".fill, .fill-block, .head-field").forEach(function (el) {
      el.contentEditable = on ? "true" : "false";
    });
    if (yearTabs) {
      yearTabs.querySelectorAll("a[href^='annee-']").forEach(function (a) {
        a.contentEditable = on ? "true" : "false";
      });
    }
    toggleBtn.textContent = on ? "✅ Terminer l'édition" : "✏️ Activer l'édition";
  }

  // ---- Nettoie une copie de la page actuelle (retire tout ce que ce
  // script a injecté) pour obtenir un .html autonome, qu'il serve à
  // l'export de cette page ou de base à une nouvelle page année.
  function cleanDocumentClone() {
    var clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll(".app-injected").forEach(function (el) { el.remove(); });
    clone.querySelectorAll("[contenteditable]").forEach(function (el) { el.removeAttribute("contenteditable"); });
    var body = clone.querySelector("body");
    if (body) body.classList.remove("is-editing");
    // Fige le choix actuel des menus de notation dans le HTML exporté,
    // pour qu'il survive même en l'absence du localStorage d'origine.
    clone.querySelectorAll("select").forEach(function (sel) {
      Array.prototype.forEach.call(sel.options, function (opt) { opt.removeAttribute("selected"); });
      if (sel.options[sel.selectedIndex]) sel.options[sel.selectedIndex].setAttribute("selected", "selected");
    });
    return clone;
  }

  function downloadHtml(clone, filename) {
    var html = "<!DOCTYPE html>\n" + clone.outerHTML;
    var blob = new Blob([html], { type: "text/html" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---- Export : télécharge la page actuelle, modifications incluses ----
  function exportPage() {
    downloadHtml(cleanDocumentClone(), currentFile);
    showToast("Fichier téléchargé : " + currentFile);
  }

  // ---- Petit message de confirmation, pour les actions qui n'ont pas
  // d'autre retour visuel (export/import/reset) ----
  var toastEl = null;
  var toastTimer = null;
  function showToast(message) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "edit-toast app-injected";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("visible"); }, 3000);
  }

  // Import/reset rechargent la page : le message de confirmation doit
  // survivre au rechargement, donc il transite par sessionStorage.
  var TOAST_SESSION_KEY = "eportfolio-pending-toast";
  function showToastAfterReload(message) {
    try { sessionStorage.setItem(TOAST_SESSION_KEY, message); } catch (e) {}
  }
  function consumePendingToast() {
    try {
      var message = sessionStorage.getItem(TOAST_SESSION_KEY);
      if (message) {
        sessionStorage.removeItem(TOAST_SESSION_KEY);
        showToast(message);
      }
    } catch (e) {}
  }

  // ---- Petite boîte de confirmation à 2 clics (remplace confirm()/prompt()
  // pour les actions destructrices, moins anxiogène et plus cohérent avec
  // le design du site) ----
  function confirmModal(title, message, confirmLabel, onConfirm) {
    var overlay = document.createElement("div");
    overlay.className = "edit-modal-overlay app-injected";
    var box = document.createElement("div");
    box.className = "edit-modal";
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");

    var h3 = document.createElement("h3");
    h3.textContent = title;
    var p = document.createElement("p");
    p.textContent = message;
    var actions = document.createElement("div");
    actions.className = "edit-modal-actions";
    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-cancel";
    cancelBtn.textContent = "Annuler";
    var confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "btn-confirm";
    confirmBtn.textContent = confirmLabel;

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    box.appendChild(h3);
    box.appendChild(p);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function close() { overlay.remove(); }
    cancelBtn.addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    confirmBtn.addEventListener("click", function () { close(); onConfirm(); });
    confirmBtn.focus();
  }

  // ---- Ajout d'une nouvelle page année (ex. annee-6.html) ----
  // Elle part d'une copie de la page actuelle (même structure : BC01-BC05,
  // preuves, notation...), avec sa propre clé de stockage (notes/moyennes)
  // pour ne pas se mélanger avec les autres années, et ses onglets à jour.
  function nextYearFilename() {
    var max = 0;
    yearTabs.querySelectorAll("a[href^='annee-']").forEach(function (a) {
      var m = /annee-(\d+)\.html/.exec(a.getAttribute("href"));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return "annee-" + (max + 1) + ".html";
  }

  function addYearTab() {
    var label = prompt("Intitulé de cette nouvelle année (ex. « 6e année ») :", "Nouvelle année");
    if (!label) return;
    var newFile = nextYearFilename();

    var a = document.createElement("a");
    a.className = "year-tab";
    a.href = newFile;
    a.textContent = label;
    yearTabs.insertBefore(a, yearTabs.querySelector(".year-tab-add"));
    enhanceYearTab(a);
    markActiveTab();
    saveYearTabs();

    // Génère le fichier de la nouvelle page, à partir de la page actuelle,
    // avec sa propre clé de notation/moyennes (sinon elle écraserait celle
    // de la page d'origine dans le navigateur).
    if (/^annee-/.test(currentFile)) {
      var oldSuffix = currentFile.replace("-", "").replace(".html", "");
      var newSuffix = newFile.replace("-", "").replace(".html", "");
      var clone = cleanDocumentClone();
      clone.querySelectorAll("script").forEach(function (script) {
        script.textContent = script.textContent.split(oldSuffix).join(newSuffix);
      });
      var tabs = clone.querySelector(".year-tabs");
      if (tabs) {
        tabs.querySelectorAll("a").forEach(function (link) {
          link.classList.toggle("active", link.getAttribute("href") === newFile);
          if (link.getAttribute("href") === newFile) link.setAttribute("aria-current", "page");
          else link.removeAttribute("aria-current");
        });
      }
      downloadHtml(clone, newFile);
      alert("Nouvelle page téléchargée : " + newFile + ".\nPlacez-la à côté des autres pages du portfolio (même dossier), puis adaptez son contenu.");
    } else {
      alert("Ajoutez un fichier " + newFile + " à côté des autres pages (copiez par exemple annee-3.html et renommez-le), puis ouvrez-le pour l'adapter.");
    }
  }

  function removeYearTab(a) {
    if (!confirm("Retirer « " + a.textContent.trim() + " » de la navigation ?\n(Le fichier correspondant n'est pas supprimé : vous pouvez le faire vous-même si besoin.)")) return;
    var goingToCurrentPage = a.getAttribute("href") === currentFile;
    a.remove();
    saveYearTabs();
    if (goingToCurrentPage) location.href = "index.html";
  }

  // ---- Ajoute (ou retrouve, après un rechargement) le bouton de
  // suppression sur un onglet année ----
  function enhanceYearTab(a) {
    var del = a.querySelector(".year-tab-del");
    if (!del) {
      del = document.createElement("button");
      del.type = "button";
      del.className = "year-tab-del app-injected";
      del.contentEditable = "false";
      del.title = "Retirer cette année de la navigation (le fichier .html correspondant n'est pas supprimé)";
      del.textContent = "✕";
      a.appendChild(del);
    }
    del.onclick = function (e) {
      e.preventDefault();
      removeYearTab(a);
    };
  }

  function initYearTabs() {
    if (!yearTabs) return;
    yearTabs.querySelectorAll("a[href^='annee-']").forEach(enhanceYearTab);
    var addBtn = yearTabs.querySelector(".year-tab-add");
    if (!addBtn) {
      addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "year-tab-add app-injected";
      addBtn.contentEditable = "false";
      addBtn.title = "Ajouter une nouvelle page année (télécharge un fichier .html à placer manuellement à côté des autres pages)";
      addBtn.textContent = "+ Année";
      yearTabs.insertBefore(addBtn, yearTabs.querySelector("a[href='index.html']"));
    }
    addBtn.onclick = addYearTab;
  }

  // ---- Barre d'outils flottante ----
  var toggleBtn;
  function buildToolbar() {
    var bar = document.createElement("div");
    bar.className = "edit-toolbar app-injected";

    toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "edit-toggle-btn";
    toggleBtn.textContent = "✏️ Activer l'édition";
    toggleBtn.title = "Édite le texte, duplique/supprime les blocs et ajoute des images.";
    toggleBtn.addEventListener("click", function () { setEditing(!editing); });

    var exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.className = "edit-export-btn";
    exportBtn.textContent = "💾 Télécharger cette page";
    exportBtn.title = "Enregistre uniquement cette page (avec vos modifications) dans un fichier .html. Ne télécharge pas les autres années : répétez l'opération sur chaque page.";
    exportBtn.addEventListener("click", exportPage);

    var importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.className = "edit-import-btn";
    importBtn.textContent = "📂 Importer cette page";
    importBtn.title = "Recharge uniquement cette page depuis un fichier .html exporté précédemment. Les autres années doivent être importées séparément.";
    importBtn.addEventListener("click", importPage);

    var resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "edit-reset-btn";
    resetBtn.textContent = "🗑️ Réinitialiser";
    resetBtn.title = "Vide la template (contenu, notes, onglets) et revient aux placeholders.";
    resetBtn.addEventListener("click", resetPortfolio);

    bar.appendChild(toggleBtn);
    bar.appendChild(exportBtn);
    bar.appendChild(importBtn);
    bar.appendChild(resetBtn);
    document.body.appendChild(bar);
  }

  function importPage() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".html";
    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var imported = new DOMParser().parseFromString(reader.result, "text/html");
        var importedMain = imported.getElementById("main-content");
        if (!importedMain) {
          alert("Fichier invalide : aucun contenu de portfolio trouvé dedans.");
          return;
        }
        // Le fichier exporté marque sa page d'origine avec aria-current="page"
        // sur son onglet actif : si elle ne correspond pas à cette page-ci,
        // c'est probablement le mauvais fichier (ex. annee-3.html importé
        // sur annee-5.html).
        var importedActiveTab = imported.querySelector('.year-tabs a[aria-current="page"]');
        if (importedActiveTab && importedActiveTab.getAttribute("href") !== currentFile) {
          var proceed = confirm(
            "Ce fichier semble avoir été exporté depuis « " + importedActiveTab.textContent.trim() +
            " » (" + importedActiveTab.getAttribute("href") + "), pas depuis cette page (" + currentFile +
            "). Importer quand même ?"
          );
          if (!proceed) return;
        }
        try {
          localStorage.setItem(storageKey(), importedMain.innerHTML);
          var importedTabs = imported.querySelector(".year-tabs");
          if (importedTabs) {
            importedTabs.querySelectorAll(".app-injected").forEach(function (el) { el.remove(); });
            importedTabs.querySelectorAll("[contenteditable]").forEach(function (el) { el.removeAttribute("contenteditable"); });
            localStorage.setItem(YEAR_TABS_KEY, importedTabs.innerHTML);
          }
        } catch (e) {}
        showToastAfterReload("Portfolio importé depuis " + file.name + ".");
        location.reload();
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function resetPortfolio() {
    confirmModal(
      "Réinitialiser le portfolio ?",
      "Le contenu de cette page, les notes/moyennes et les onglets année seront vidés et remplacés par les placeholders. Cette action ne peut pas être annulée.",
      "Réinitialiser",
      function () {
        clearTimeout(saveTimer);
        try {
          Object.keys(localStorage)
            .filter(function (k) { return k.indexOf("eportfolio-") === 0; })
            .forEach(function (k) { localStorage.removeItem(k); });
        } catch (e) {}
        showToastAfterReload("Portfolio réinitialisé.");
        location.reload();
      }
    );
  }

  // ---- Titre d'onglet (<title>) et description (<meta name="description">),
  // éditables comme le reste : un template réutilisable (autre étudiant,
  // autre formation) ne doit pas garder un titre/description figés dans le
  // code. Pas de classe .fill : ils ont déjà une vraie valeur, à ne pas
  // compter dans les éléments "à compléter". ----
  function bindHeadFields() {
    var titleField = document.getElementById("pageTitleField");
    var descField = document.getElementById("pageDescField");
    var descMeta = document.querySelector('meta[name="description"]');
    if (titleField && !bound.has(titleField)) {
      bound.add(titleField);
      titleField.textContent = document.title;
      titleField.addEventListener("input", function () { document.title = titleField.textContent; });
    }
    if (descField && descMeta && !bound.has(descField)) {
      bound.add(descField);
      descField.textContent = descMeta.getAttribute("content") || "";
      descField.addEventListener("input", function () { descMeta.setAttribute("content", descField.textContent); });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    consumePendingToast();
    buildToolbar();
    initYearTabs();
    enhanceSubtree(main);
    // La sidebar (hors <main>, donc hors sauvegarde automatique) a aussi
    // ses propres ".fill" (dernière mise à jour / statut) : on les rend
    // éditables elles aussi, elles seront capturées au moment de l'export.
    document.querySelectorAll(".fill, .fill-block").forEach(bindFillElement);
    bindHeadFields();
    bindBrandLogo();
    bindTextPasteImage(main);
    main.addEventListener("input", function () {
      // Avec <main> entièrement contenteditable, le caret peut être dans un
      // .fill/.fill-block imbriqué sans que l'event "input" cible cet élément
      // (son target/document.activeElement reste <main>) : bindFillElement
      // (son propre listener "input") ne se déclenche donc jamais pour ces
      // champs. On retrouve le bon élément via la sélection courante.
      var sel = window.getSelection();
      var node = sel && sel.anchorNode;
      if (node) {
        var el = node.nodeType === 1 ? node : node.parentElement;
        var fillEl = el && el.closest && el.closest(".fill, .fill-block");
        if (fillEl) fillEl.classList.remove("fill", "fill-block");
      }
      if (typeof window.updateCompletion === "function") window.updateCompletion();
      scheduleSave();
    });
    main.addEventListener("change", scheduleSave);
  });
})();
