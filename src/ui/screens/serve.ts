/** Till transactions, haggling and customer conversations. */
import type { GameController } from '../../game/GameController';
import { formatMoney, round } from '../../core/math';
import { ARCHETYPES } from '../../data/customers';
import { getDryGood } from '../../data/catalog';
import { EQUIPMENT_WANTS } from '../../data/retail';
import { getSpecies } from '../../data/species';
import {
  acceptChance, adviceSetupText, offerPlant, checkoutQuote, completeSale, counterOffer, inStockSpecies, offerAddOn, problemFor,
  refuseSale, resolveAdvice, resolveProblem, servingCustomer, equipmentOptions, resolveEquipmentAdvice,
} from '../../sim/customers';
import { nudgeRep } from '../../sim/reputation';
import { availablePlants } from '../../sim/plants';
import type { CustomerState } from '../../sim/types';
import { play } from '../../audio/sfx';
import { minuteOfDay } from '../../sim/time';

function greeting(c: GameController, cu: CustomerState): string {
  const arch = ARCHETYPES.find((a) => a.id === cu.archetype);
  if (cu.returning) return `Hi ${c.state.playerName}! Good to be back.`;
  return arch ? arch.greetings[Math.floor(cu.appearance % arch.greetings.length)] : 'Hello!';
}

export async function serveAtTill(c: GameController): Promise<void> {
  const blocked = c.lockReason('serve');
  if (blocked) {
    await c.ui.say(null, blocked);
    return;
  }
  const sim = c.sim!;
  const s = c.state;
  const cu = servingCustomer(s, sim.layout);
  if (!cu) {
    await c.ui.say(null, 'Nobody is waiting at the till yet.');
    return;
  }
  const ctx = sim.customerCtx;
  let intro = true;
  let plantOffered = false;
  for (;;) {
    const q = checkoutQuote(s, cu);
    if (!q.lines.length) {
      await c.ui.say(cu.name, 'Oh, never mind. Nothing I wanted is left.');
      refuseSale(s, ctx, cu);
      return;
    }
    const linesText = q.lines.map((l) => `${l.qty} x ${l.label}`).join(', ');
    const hello = cu.returning ? `Hi ${s.playerName}!` : minuteOfDay(s.minute) < 720 ? 'Morning!' : 'Afternoon!';
    const text = `${intro ? `${hello} ` : ''}I'll take ${linesText}. That comes to ${formatMoney(q.total)}.`;
    intro = false;
    const choices = [`Ring it up (${formatMoney(q.total)})`, 'Give 10% off'];
    const addOnIds = ['conditioner', 'test_kit', 'flake_food'].filter((id) => (s.dryGoods[id] ?? 0) > 0 && !cu.addOns.includes(id));
    const suggest = addOnIds[0];
    if (suggest) choices.push(`Suggest ${getDryGood(suggest).name} (${formatMoney(getDryGood(suggest).retail)})`);
    const canPlant = !plantOffered && availablePlants(s).length > 0;
    if (canPlant) choices.push('Suggest a potted plant');
    choices.push('Refuse the sale');
    const pick = await c.ui.ask(cu.name, text, choices);
    if (pick < 0) return; // stepped away, customer keeps waiting
    const label = choices[pick];
    sim.advance(1);
    if (label.startsWith('Ring it up')) {
      const offer = counterOffer(s, cu, sim.rng);
      if (offer !== null && offer < q.total) {
        const mid = Math.round(((offer + q.total) / 2) * 2) / 2;
        const h = await c.ui.ask(cu.name, `Hmm, ${formatMoney(q.total)}? Would you do ${formatMoney(offer)}?`, [
          `Deal (${formatMoney(offer)})`,
          `Meet me halfway (${formatMoney(mid)})`,
          'Sorry, the price is firm',
        ], false);
        if (h === 0) return finish(c, cu, offer, 'Lovely, thanks!');
        if (h === 1) {
          if (sim.rng.chance(acceptChance(cu, mid, offer))) return finish(c, cu, mid, 'Go on then. Deal!');
          await c.ui.say(cu.name, "No, that's too much for me.");
          refuseSale(s, ctx, cu);
          return;
        }
        if (sim.rng.chance(1 - cu.traits.negotiation * 0.6)) return finish(c, cu, q.total, 'Fine, fine. Worth it.');
        await c.ui.say(cu.name, "Then I'll leave it, thanks.");
        nudgeRep(s, 'value', -0.5);
        refuseSale(s, ctx, cu);
        return;
      }
      return finish(c, cu, q.total, 'Thank you!');
    }
    if (label.startsWith('Give 10%')) return finish(c, cu, round(q.total * 0.9, 2), 'Oh, how kind! Thank you!');
    if (label === 'Suggest a potted plant') {
      plantOffered = true;
      const yes = offerPlant(s, cu, sim.rng);
      await c.ui.say(cu.name, yes ? 'Oh, that would look lovely in my tank. Go on then.' : 'Not today, thanks.');
      continue;
    }
    if (label.startsWith('Suggest') && suggest) {
      const yes = offerAddOn(s, cu, suggest, sim.rng);
      await c.ui.say(cu.name, yes ? `Good idea, I'll add a ${getDryGood(suggest).name}.` : "No thanks, I've got some at home.");
      continue;
    }
    if (label.startsWith('Refuse')) {
      refuseSale(s, ctx, cu);
      await c.ui.say(cu.name, 'Well! Fine then.');
      return;
    }
  }
}

async function finish(c: GameController, cu: CustomerState, total: number, line: string): Promise<void> {
  const res = completeSale(c.state, c.sim!.customerCtx, cu, total);
  play('cash');
  c.sim!.advance(1);
  const what = [res.fishCount ? `${res.fishCount} fish` : '', res.plantCount ? `${res.plantCount} plant${res.plantCount > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ') || 'goods';
  c.ui.toast(`Sold ${what} for ${formatMoney(total)}`, 'good');
  await c.ui.say(cu.name, line);
}

export async function talkToCustomer(c: GameController, cu: CustomerState): Promise<void> {
  const blocked = c.lockReason('serve');
  if (blocked) {
    await c.ui.say(cu.name, `(Just looking around.) ${blocked}`);
    return;
  }
  const sim = c.sim!;
  const s = c.state;
  const ctx = sim.customerCtx;
  const needsHelp = cu.phase === 'seeking_help' || cu.phase === 'waiting_help';
  if (needsHelp && cu.goal === 'advice_stocking') {
    cu.thought = null;
    const stock = inStockSpecies(s).slice(0, 8);
    const labels = stock.map((id) => {
      const sp = getSpecies(id);
      return `${sp.commonName} (${sp.section}, ${sp.adultSizeCm}cm)`;
    });
    labels.push('Nothing in stock suits that');
    const pick = await c.ui.ask(cu.name, `${greeting(c, cu)} ${adviceSetupText(cu)}`, labels);
    if (pick < 0) {
      cu.thought = '?';
      return;
    }
    const res = resolveAdvice(s, ctx, cu, pick < stock.length ? stock[pick] : null);
    sim.advance(3);
    await c.ui.say(cu.name, res.reply);
    return;
  }
  if (needsHelp && cu.goal === 'buy_equipment') {
    cu.thought = null;
    const story = EQUIPMENT_WANTS.find((w) => w.items.join() === (cu.wants ?? []).join())?.story ?? 'I need some equipment.';
    const opts = equipmentOptions(s, cu);
    const pick = await c.ui.ask(cu.name, `${story} What would you recommend?`, [...opts.map((o) => o.label), 'Sorry, we don\'t have the right thing']);
    if (pick < 0) {
      cu.thought = '?';
      return;
    }
    const res = resolveEquipmentAdvice(s, ctx, cu, pick < opts.length ? opts[pick].items : null);
    sim.advance(3);
    await c.ui.say(cu.name, res.reply);
    return;
  }
  if (needsHelp && cu.goal === 'problem') {
    cu.thought = null;
    const prob = problemFor(cu);
    // Stable shuffle so the right answer is not always first.
    const order = prob.options.map((_, i) => i).sort((a, b) => ((a * 7 + cu.appearance) % 5) - ((b * 7 + cu.appearance) % 5));
    const pick = await c.ui.ask(cu.name, prob.prompt, order.map((i) => prob.options[i].text));
    if (pick < 0) {
      cu.thought = '?';
      return;
    }
    const res = resolveProblem(s, ctx, cu, order[pick]);
    sim.advance(3);
    await c.ui.say(cu.name, res.reply);
    return;
  }
  const lines: string[] = [];
  if (cu.basket.length) lines.push("I've found what I want. Just heading to the till!");
  else if (cu.phase === 'leaving') lines.push('Bye for now!');
  else if (cu.goal === 'buy_specific' && cu.goalData.speciesId) lines.push(`I'm looking for ${getSpecies(cu.goalData.speciesId).commonName}. Do you have any?`);
  else lines.push('Just browsing, thanks!');
  await c.ui.say(cu.name, lines[0]);
}
