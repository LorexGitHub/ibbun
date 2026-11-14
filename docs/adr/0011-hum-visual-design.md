# ADR 0011: Hum visual design, with a static mock as the target

- Status: Superseded by [ADR 0014](0014-ma-visual-design.md)
- Date: 2026-11-05

## Context

ibbun needs one visual direction before screens are built, so each screen doesn't invent its own look. We made a static mock of the Today and Review screens and the logo, and agreed it is what the finished app should look like.

## Decision

[`docs/design/ibbun-mock.html`](../design/ibbun-mock.html) is the visual target for the app. Open it in a browser. When a real screen and the mock disagree, the mock wins unless this ADR is superseded.

The mock uses the **Hum** theme from [nutlope/hallmark](https://github.com/nutlope/hallmark) (`skills/hallmark/references/themes/hum.md`):

- Cream paper with grain and fibre texture, torn edges with a pale fringe, light from the top left.
- Card-stock buttons with a solid bottom edge that presses down. Pear yellow is the primary action, blue is for links and focus, coral is the one loud colour, mint is for growth.
- Chillax (Fontshare, weights 500 and 600) for all Latin text, Zen Maru Gothic for Japanese.
- No serif, no pure white, no square corners, no emoji or stock icons.

The logo is 文 (bun, "writing") in four ink strokes on a pear card-stock tile, with an off-centre coral dot. It is the `#mark` symbol in the mock.

The mock's `:root` tokens are the starting point for the app's real stylesheet. Copy them; don't re-derive them.

## Alternatives considered

- **Other logo marks** (Stack, Sprout, Hum speech bubble). They are kept in the mock for reference. 文 won because it says "writing" and ties to the name.

## Consequences

- The mock is static on purpose. It shows how the app looks, not how it behaves. Its numbers and copy are placeholders.
- The mock lives under `docs/`, not `web/`, so it is never deployed.
- Chillax loads from Fontshare, not Google Fonts. The app must self-host it or allow that origin.
