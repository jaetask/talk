# 30. Avatar shapes are drawn from formulas, not traced from artwork

## Context

The page began as another project's web app under the MIT licence. That project's artwork is not used here.

## Decision

`page/avatar/shapes.ts` draws each avatar from a few formulas: a silhouette in a 48-unit box with two eyes cut out of the fill. Nothing is traced from anyone's artwork.

## Consequences

A new shape must also be drawn from a formula or be original work. Do not import avatar artwork from the project the page began as.
