# The table shop, more income, and reasons to come back

*2026-10-19, from the owner's direction: warm, comforting, a little nostalgic, quietly luxurious ("pampered after work"),
for 40-70 first and modern enough for younger players.* Everything here keeps the product rules in DESIGN.md §2: no ads,
no subscriptions, no rentals, nothing that makes a game easier, no timers, no nagging.

## 1. What this audience buys (and why these themes)

- **What the card apps sell:** the big solitaire apps sell or reward *themes*, with deck, card back and background
  mixable separately ([MWM Solitaire](https://apps.apple.com/app/id1304695854), 50+ themes). Seasonal and nature themes
  are the staple.
- **What these homes look like now:** "quiet luxury" (warm whites, taupe, chocolate, fine materials), "grandmillennial"
  (chintz, china, antique touches), modern organic (wood, linen), and a bold pastel "dopamine" counter-trend
  ([France & Son](https://franceandson.com/blogs/recents-blogs/quiet-luxury-vs-dopamine-decor-which-interior-trend-is-winning-2026),
  [Redecor](https://www.redecor.com/from-cottagecore-to-grandmillenial-everything-you-need-to-know-about-spring-cottage),
  [Resident](https://resident.com/amp/story/design/2025/12/11/luxury-home-design-trends-for-2026-warmth-craft-and-the-return-of-personal-style)).
- **How sure this is:** no source has sales data by age. These are design-trend signals plus what the incumbents sell,
  so the opt-in analytics (`theme_view`, `unlock {product}`) should confirm which themes earn their place.

## 2. The shop as built (proto/themes.js, sim/generator.json → `shop`, `products`)

| Tier | Price | Themes | Feel |
|---|---|---|---|
| Free | — | Walnut (default), Green, Blue, Red, Orange, Pink felt | the owner's free colours plus the warm default |
| Classic | $2.99 each | Sunday gingham, Lake cabin, Diner '57, Garden party | nostalgic Americana: farmhouse, lodge, 1950s, chintz |
| Signature | $4.99 each | Antique parlor, Leopard lounge, Mid-century, Leather & brass, Whiskey & shells | antique, a little wild, mid-century modern, club, a lodge bar: barrel staves, amber light, shotgun shells |
| **Luxe collection** | $9.99 each | Gilded (gold), Sterling (silver), Art deco, Postmodern '86, Marble & brass | gold to silver, antique to art deco to postmodern |

- A theme is a table surface, a card back and an accent colour (paper and brass). Card *faces* never change, so
  readability is never for sale. The card back can be mixed with any table you own (Options › Card back).
- Every theme is a non-consumable, Family Sharing on, Restore on the title screen, in Options and in the shop.
- Previews are painted live (the same procedural art as the game), so the shop and the store screenshots always match.
- The shop opens with a thank-you note, and every purchase ends with a personal thank-you.
- Under the caregiver lock the shop sits behind the PIN.

## 3. More ways to earn, without breaking the promise

Ranked by expected value for effort. Each is a proposal; none is built.

1. **Collection bundles.** All Classic $7.99, all Signature $12.99, the Complete collection $24.99 (about $70 if bought
   one by one). Bundles lift the average order and suit a gift buyer (the adult child).
2. **Seasonal themes, a new one most months.** Fall harvest, Christmas Eve by the fire, New Year's gold, Valentine's,
   spring garden, Fourth of July picnic. $2.99, and they stay for sale all year: no countdowns, no fear of missing out.
   They also give the listing something new to show every month.
3. **Personal card backs.** Your initials in a monogram ($4.99), or a family photo on the back ($4.99). Grandparents
   playing with a grandchild's face on every card is the most emotional item in the shop.
4. **Deck styles.** Painted court cards, vintage 1900s pips, an extra-large-index deck. The large-index deck should be
   **free** (accessibility is never sold); the art decks are $2.99-4.99.
5. **Table ambience.** Gentle original soundscapes made in code like the rest of the sound: rain on the window,
   a crackling fire, an evening radio. $1.99 each, or folded into themes (the Cabin theme comes with the fire).
6. **A tip jar.** "Buy the developer a cup of coffee", $1.99 / $4.99 / $9.99 consumables, reached only from the shop's
   thank-you card; never prompted. Apple allows tips as consumable in-app purchases.
7. **More games inside Everything** (Euchre, Canasta and Hand and Foot, Pinochle, Cribbage, Gin, Oh Hell). Existing
   owners get them free. The price for *new* buyers can rise from $6.99 to $9.99 as the library grows, which rewards
   early buyers and is the usual pay-once practice.
8. **Android.** The same code ships to Google Play (Capacitor); the senior audience is large there too.
9. **Gift the app.** An App Store gift link plus a "Set this up for a parent" page on the site that walks the caregiver
   through Family Sharing.

## 4. Keeping people at the table (immersion and habits, no dark patterns)

1. **Deal of the day.** The same seed for everyone each day, with its own leaderboard and a gentle "days played" count
   (a missed day is never punished).
2. **Family card night.** Game Center family tables plus an opt-in reminder the family sets together ("Sundays at 7").
3. **Hints and a coach.** "Suggest a card" from the Expert bot with its Why sentence: younger players learn, rusty
   players get confident.
4. **Replays.** Replay any hand from its seed on the score sheet. "What would Extreme have played?" shows the
   difference card by card.
5. **A keepsake book.** Memorable hands get saved automatically (first moon, a Boston, beating Extreme, a game with
   Mom), each with its seed, so it can be replayed or shared with the family.
6. **A living table.** The lamp warms in the evening by the phone's clock; small seasonal props appear on the walnut
   table (a pumpkin in October, a wreath in December), free for everyone.
7. **Bot personalities.** Kind table talk from the bots ("Nice cover, partner"), always optional, never mocking.
8. **Seasons against the bots.** A ten-game ladder with rising difficulty and a trophy shelf.
9. **House-rule profiles.** "Grandma's rules", shared with the family as a short code.
10. **Your year at the table.** A December recap: hands played, moons shot, favourite partner, best night.
11. **Opt-in reminders only.** At most one a day ("Your daily deal is ready"); off by default.

## 5. Accessibility built in (DESIGN.md §6, Options › Accessibility)

Text size (Normal / Large / Extra large), Comfort mode, a four-colour deck, vibration on your turn and on tricks won,
full VoiceOver labels and announcements, and **Read the table aloud** with the phone's own voice: every bid, play and
trick is spoken; the bots wait for the voice; a Read button gives the table and your hand on demand; and in Comfort the
selected card is spoken before you confirm it.
