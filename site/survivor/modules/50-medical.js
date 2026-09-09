/* Medicine. The point of this screen is that it does not tell you what is
   wrong with you. The disease system reports symptoms — what you can
   actually observe about yourself — and a differential, which is a list of
   what those symptoms are consistent with and how well. Choosing the drug
   is the player's job, and choosing the wrong one wastes it.

   The injury half is more mechanical because trauma is: a limb bleed takes
   a tourniquet, a junctional one takes packing, and a broken bone that
   never gets splinted essentially never heals. All of that is already in
   SV.InjurySystem; this is the interface to it.

   Emits: 'treated' { drug, results }, 'wound-care' { wound, care }. */
SurvivorGame.module({
  id: 'medical',
  order: 50,

  init(ctx) {
    const { SV } = ctx;

    /* Which item in the pack corresponds to which care action, and what
       using it costs. A tourniquet is one item; direct pressure is free and
       occupies both your hands. */
    const CARE_ITEM = {
      directPressure: null,
      pressureDressing: 'bandage',
      tourniquet: 'tourniquet',
      woundPacking: 'gauze',
      hemostaticGauze: 'gauze',
      sutures: 'sutures',
      irrigate: 'cleanWater',
      antiseptic: 'antiseptic',
      cautery: null,
      splint: 'splint',
    };
    const CARE_SECONDS = {
      directPressure: 30, pressureDressing: 90, tourniquet: 45, woundPacking: 120,
      hemostaticGauze: 90, sutures: 600, irrigate: 180, antiseptic: 60, cautery: 90, splint: 300,
    };

    const sheet = document.createElement('div');
    sheet.className = 'screen';
    sheet.hidden = true;
    sheet.innerHTML = '<div class="sheet"></div>';
    document.body.appendChild(sheet);
    const body = sheet.querySelector('.sheet');

    let busy = null;              // { seconds, remaining, label, run }

    function haveDrug(id) {
      const inv = ctx.player.inventory;
      if (inv.has(id, 1)) return id;
      // The generic pack items stand in for whichever antibiotic they are.
      if (SV.TREATMENT[id] && !SV.TREATMENT[id].crafted && inv.has('antibiotics', 1)) return 'antibiotics';
      if (id === 'oralRehydration' && inv.has('cleanWater', 1)) return 'cleanWater';
      if (id === 'rest' || id === 'eatFat' || id === 'rewarmDry' || id === 'debridement') return '(no item needed)';
      return null;
    }

    function bodyRegionName(id) {
      const r = SV.BODY_REGION[id];
      return r ? r.id.replace(/([A-Z])/g, ' $1').toLowerCase() : id;
    }

    function render() {
      const p = ctx.player;
      const sym = p.disease.observedSymptoms();
      const diff = p.disease.differential();
      const inj = p.injury.summary();
      const st = p.body.status(ctx.world.clock.hourOfDay);

      const vitals = [
        ['core temperature', `${st.coreTempC.toFixed(1)} °C`, st.coreTempC > 38 || st.coreTempC < 35.5],
        ['blood loss', `${(st.bloodLoss * 100).toFixed(0)}% (class ${st.hemorrhageClass})`, st.hemorrhageClass > 1],
        ['pain', `${Math.round(inj.pain * 100)}%`, inj.pain > 0.4],
        ['capacity', `${Math.round(st.capacity * 100)}%`, st.capacity < 0.7],
        ['hydration', `${Math.round((1 - st.thirst) * 100)}%`, st.thirst > 0.5],
      ];

      const symRows = sym.length
        ? sym.map((s) => `<li>${s.text} <span class="faint">(${s.severity > 0.66 ? 'severe' : s.severity > 0.33 ? 'moderate' : 'mild'})</span></li>`).join('')
        : '<li class="faint">Nothing you can observe about yourself.</li>';

      const diffRows = diff.length
        ? diff.slice(0, 6).map((d) => {
          const opts = d.treatments.map((t) => {
            const item = haveDrug(t);
            const name = (SV.TREATMENT[t] || {}).name || t;
            return `<button data-drug="${t}" ${item ? '' : 'disabled'} title="${item || 'you do not have this'}">${name}</button>`;
          }).join(' ');
          return `<tr><td><b>${d.name}</b><div class="faint" style="font-size:11px">${d.note || ''}</div></td>`
            + `<td style="width:90px">${Math.round(d.confidence * 100)}% fit</td>`
            + `<td>${opts}</td></tr>`;
        }).join('')
        : '<tr><td colspan="3" class="faint">No differential — nothing is presenting.</td></tr>';

      const woundRows = inj.wounds.length
        ? inj.wounds.map((w, i) => {
          const care = careOptionsFor(w);
          return `<tr><td>${w.type} to the ${bodyRegionName(w.region)}`
            + `${w.infected ? ' <b style="color:#d8a22c">infected</b>' : ''}`
            + `${w.closed ? ' <span class="faint">closed</span>' : ''}</td>`
            + `<td style="width:120px">${w.bleedLps > 0.0005 ? `${(w.bleedLps * 60000).toFixed(0)} ml/min` : 'not bleeding'}</td>`
            + `<td>${care.map((c) => `<button data-care="${c}" data-wound="${i}">${c.replace(/([A-Z])/g, ' $1').toLowerCase()}</button>`).join(' ')}</td></tr>`;
        }).join('')
        : '<tr><td colspan="3" class="faint">No open wounds.</td></tr>';

      const boneRows = inj.fractures.length
        ? inj.fractures.map((f, i) => `<tr><td>${f.bone}${f.compound ? ' <b style="color:#d8442c">compound</b>' : ''}</td>`
          + `<td style="width:120px">${f.splinted ? 'splinted' : '<b>unsplinted</b>'}</td>`
          + `<td>${f.daysRemaining.toFixed(0)} days${f.splinted ? '' : ` <button data-splint="${i}">splint it</button>`}</td></tr>`).join('')
        : '<tr><td colspan="3" class="faint">Nothing broken.</td></tr>';

      body.innerHTML = `
        <h2>Condition</h2>
        <div class="cols">
          <div>
            <h3>Vitals</h3>
            <table>${vitals.map(([k, v, bad]) => `<tr><td>${k}</td><td style="text-align:right${bad ? ';color:#d8a22c' : ''}">${v}</td></tr>`).join('')}</table>
            ${inj.concussion ? `<p style="color:#d8a22c">Concussed — ${inj.concussion.toFixed(2)} severity. Do not take another knock.</p>` : ''}
            ${inj.tourniquets && inj.tourniquets.length ? `<p style="color:#d8442c">Tourniquet on ${inj.tourniquets.length} limb(s). ${inj.tourniquets.map((t) => `${t.region}: ${t.minutes.toFixed(0)} min`).join(', ')}</p>` : ''}
            <h3>What you can observe</h3>
            <ul>${symRows}</ul>
          </div>
          <div>
            <h3>Differential</h3>
            <p class="faint" style="font-size:11px">Consistent with what you have, best fit first.
              A percentage is not a diagnosis — treating the wrong one costs you the drug.</p>
            <table>${diffRows}</table>
          </div>
        </div>
        <h3>Wounds</h3>
        <table>${woundRows}</table>
        <h3>Bones</h3>
        <table>${boneRows}</table>
        <p class="faint">${busy ? `Working: ${busy.label} — ${busy.remaining.toFixed(0)} s left.` : 'C to close.'}</p>`;
    }

    /* Which care makes sense for this wound. Offering a tourniquet for a
       chest wound would be a lie, and the injury system would refuse it
       anyway. */
    function careOptionsFor(w) {
      const region = SV.BODY_REGION[w.region] || {};
      const out = [];
      if (w.bleedLps > 0.0002 && !w.controlled) {
        out.push('directPressure');
        if (ctx.player.inventory.has('bandage', 1)) out.push('pressureDressing');
        if (region.tourniquetable) out.push('tourniquet');
        else out.push('woundPacking');
        if (ctx.player.inventory.has('gauze', 1)) out.push('hemostaticGauze');
      }
      if (!w.closed) {
        if (ctx.player.inventory.has('sutures', 1)) out.push('sutures');
        out.push('cautery');
      }
      if (ctx.player.inventory.has('antiseptic', 1)) out.push('antiseptic');
      if (ctx.player.inventory.has('cleanWater', 1)) out.push('irrigate');
      return out;
    }

    /* Care takes time, and time is the thing a bleeding player does not
       have. Sutures take ten minutes; a tourniquet takes forty-five
       seconds, and that difference is the whole decision. */
    function startCare(label, seconds, run) {
      if (busy) { ctx.toast('You are already doing something.'); return; }
      busy = { seconds, remaining: seconds, label, run };
      render();
    }

    body.addEventListener('click', (e) => {
      const t = e.target;
      if (t.dataset.drug) {
        const drug = t.dataset.drug;
        const item = haveDrug(drug);
        if (!item) { ctx.toast('You do not have that.'); return; }
        startCare(`taking ${(SV.TREATMENT[drug] || {}).name || drug}`, 20, () => {
          if (item !== '(no item needed)') ctx.player.inventory.remove(item, 1);
          const results = ctx.player.disease.treat(drug);
          const worked = results.filter((r) => r.efficacy > 0.2);
          if (!worked.length) ctx.log('Nothing changes. Either it was the wrong drug or it is too late for it.', true);
          else ctx.log(worked.map((r) => `${r.infection}: ${r.effect}`).join('; '), true);
          ctx.player.practise('medicine', 0.05);
          ctx.emit('treated', { drug, results });
        });
      }
      if (t.dataset.care) {
        const care = t.dataset.care;
        const idx = +t.dataset.wound;
        const wound = ctx.player.injury.wounds.filter((w) => !w.healed)[idx];
        if (!wound) return;
        const need = CARE_ITEM[care];
        if (need && !ctx.player.inventory.has(need, 1)) { ctx.toast(`You need ${need}.`); return; }
        startCare(care.replace(/([A-Z])/g, ' $1').toLowerCase(), CARE_SECONDS[care] || 60, () => {
          if (need) ctx.player.inventory.remove(need, 1);
          const r = wound.apply(care);
          if (r && !r.ok) ctx.log(`That will not work here: ${r.reason}`, true);
          else ctx.log(`${care.replace(/([A-Z])/g, ' $1').toLowerCase()} applied.`, true);
          if (care === 'cautery') ctx.log('It stops the bleeding and it is a burn now.', true);
          ctx.player.practise('medicine', 0.04);
          ctx.emit('wound-care', { wound, care });
        });
      }
      if (t.dataset.splint) {
        const idx = +t.dataset.splint;
        const f = ctx.player.injury.fractures.filter((x) => !x.healed)[idx];
        if (!f) return;
        if (!ctx.player.inventory.has('splint', 1)) { ctx.toast('You need a splint.'); return; }
        startCare(`splinting the ${f.name}`, CARE_SECONDS.splint, () => {
          ctx.player.inventory.remove('splint', 1);
          const r = ctx.player.injury.splint(f.bone);
          if (!r.ok) { ctx.log(r.reason, true); return; }
          ctx.log(`${f.name} splinted. It will actually heal now.`, true);
          ctx.player.practise('medicine', 0.06);
        });
      }
      render();
    });

    ctx.onUpdate((dt) => {
      if (!busy) return;
      // First aid on yourself is not free: you are sitting still doing it.
      busy.remaining -= dt * (ctx.world.clock.timeScale || 1);
      ctx.state.movementLocked = true;
      if (busy.remaining > 0) { if (!sheet.hidden) render(); return; }
      const run = busy.run;
      busy = null;
      ctx.state.movementLocked = !sheet.hidden;
      try { run(); } catch (e) { ctx.log(`medical: ${e.message}`); }
      if (!sheet.hidden) render();
    });

    function toggle() {
      sheet.hidden = !sheet.hidden;
      ctx.state.uiOpen = !sheet.hidden;
      ctx.state.movementLocked = !sheet.hidden || !!busy;
      if (!sheet.hidden) render();
    }
    ctx.key('c', toggle, 'Condition and medicine');
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) toggle(); });

    /* A bleed the player has not noticed is the leading cause of death in
       this game, so it gets said out loud rather than sitting on a screen. */
    let lastWarn = 0;
    ctx.onUpdate(() => {
      const bleed = ctx.player.injury.totalBleedLps();
      if (bleed > 0.002 && performance.now() - lastWarn > 12000) {
        lastWarn = performance.now();
        const minutes = (ctx.player.body.bloodVolumeL * 0.3) / (bleed * 60);
        ctx.toast(`Bleeding — about ${minutes.toFixed(0)} minutes before it matters. C to treat it.`);
      }
    });
  },
});
