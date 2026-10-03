# Staff

How employees work, for designers and agents changing `src/sim/staff.ts` or `src/data/staff.ts`.

## The entity

A `StaffEntity` (see SAVE_SCHEMA.md) is a person on a floor with a position, path, role, task, four skills (0 to 100), a personality, a daily wage, experience, a hire day, a speech bubble and work stats. Staff are drawn with the normal character art in the blue shop polo with a name tag. Face one and press Z for their detail screen (role, status, skills, personality, suggestions, dismiss).

## Hiring

Three applicants appear at the office PC (Staff > Hire staff) every three days. Skills start around `22 + 6 x shop level`, plus a random spread and the personality bias. Wage per day: `(12 + average skill x 0.3) x personality factor` (about £25 for an average applicant). Up to six staff. Dismissal pays one final day.

| Personality | Strengths | Weaknesses | Mechanics |
| --- | --- | --- | --- |
| Meticulous | Spotless cleaning, careful | Slow | +18 cleaning, -15 speed, jobs x1.25 time, thoroughness x1.1 |
| Chatty | Great with customers | Distracted | +20 service, -8 cleaning, 35% chance a chat runs long (customers like it) |
| Speedy | Fast at everything | Leaves dirt, rushes advice | +22 speed, jobs x0.7 time, thoroughness x0.85 |
| Fish nerd | Excellent advice, sensible orders | Awkward, slow at the till | +24 knowledge, -12 service, wage x1.1 |
| Steady | Consistent | Learns slowly | +4 to everything, learning x0.75 |
| Eager | Learns fast, cheap | Low skills, beginner mistakes | Low start, learning x1.8, wage x0.75 |

## Skills

- **Cleaning:** how much of a cleaning job is really done (`thoroughness`, 62% to 100%).
- **Service:** customer satisfaction while serving or advising, and add-on sales at the till.
- **Speed:** walking speed and job time (`jobTimeFactor`).
- **Knowledge:** chance of correct advice (`adviceAccuracy`, 15% to 97%), the quality of stock and aquascape suggestions, and picking the most urgent job.

Practice raises the skill used by about 0.05 points per job (scaled by personality, slower near the cap of 95). A good hire improves noticeably over a season, not a day.

## Roles and behaviour

Staff work 08:30 to 18:30, then walk out of the front door. Each sim step, a free staff member chooses a task by role:

- **Sales:** serve the till if customers are queueing and the player is not at the till; otherwise walk to any customer with a question on any floor. Advice uses the same `resolveAdvice` / `resolveProblem` as the player, with the choice made by knowledge.
- **Tank Maintenance:** `maintenanceJobs()` ranks one job per tank from `diagnoseTank` (critical 100, warning 50, advice 10; dead fish and hunger weighted up). Staff skip tanks a colleague is already on. The job is a real fix from `FIXES` (water change, glass, algae, vacuum, filter, remove dead, feed, RO top-off) run when the timer ends.
- **Stock:** suggest orders every couple of hours (up to three open); feed and remove dead fish between suggestions.
- **Floater:** queues of two or more, then questions, then suggestions and tank jobs, then the till.

With nothing to do they tidy up nearby. "Works on" (staff detail screen) keeps someone to one floor: maintenance jobs and customers elsewhere are ignored.

Equipment customers with questions are answered the same way as fish questions: a knowledgeable adviser offers the cheapest option that covers the need (bundles first); a wrong answer is a plausible mismatch such as a 50W heater for a 100L tank.

Each personality has a small dialogue pool (`PersonalityDef.lines`) used 60% of the time, falling back to the shared `STAFF_LINES`.

## Suggestions (proposals)

Staff never spend money on their own.

- **Stock:** from real supplier stock (with stock reserved by other open suggestions subtracted), demand, how many of that species the shop has, margin, and tank suitability (water type, temperature, size, residents). Quantity fills the tank to about 85% and meets the supplier's minimum order. Knowledgeable staff choose the best tank; others may pick a worse one, and the order warnings then say why.
- **Aquascape:** for a tank with a cover or cave issue, a decor item that suits the water type; the reason includes the effect predicted by running `addDecor` on a cloned state ("Hiding cover 12% → 22% (55% recommended)").

When a suggestion is ready, the staff member walks to the player (on any floor) and asks: **Approve order** / **Go ahead** (order placed or decor bought now), **Review order** / **Show me** (full detail: species, quantity, supplier, destination, cost, reason, warnings; the quantity can be edited) or **Not now** / **Leave it** (comes back later). Undelivered suggestions wait under Staff > Suggestions at the PC. Suggestions expire after two days and are withdrawn if the supplier sells out.

## Idle Mode

Staff do nothing in Idle Mode: the simulation does not advance, so they stand where they are and look around (purely visual).

## Extending

Add personalities in `PERSONALITIES` (keep them trade-offs), roles in `ROLES` and a branch in `chooseTask`. New work should call existing sim actions so staff and player results are identical. Tests live in `tests/staff.test.ts`.
