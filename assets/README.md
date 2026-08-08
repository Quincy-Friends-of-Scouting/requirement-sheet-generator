# assets

Hand-supplied inputs. Put your troop or council watermark here:

```
assets/watermark.png     # or .jpg / .jpeg
```

`@react-pdf/renderer` accepts **PNG and JPEG only**. If yours arrives as WebP:

```sh
sips -s format png assets/watermark.webp --out assets/watermark.png
```

`pnpm render:badges` picks it up automatically and prints which file it used.
There is no watermark in this repo and its absence is not an error — the sheets
render unmarked and say so, because the repo publishes the tool rather than any
one troop's material.

## Why here and not `data/`

`data/` is machine-generated and disposable — `rm -rf data && pnpm scrape:badges`
rebuilds the whole corpus from scratch. A watermark kept there would be destroyed
by a routine rebuild and could not be recovered from this repo.

Everything in `assets/` is the opposite: supplied by hand, irreplaceable, and
safe from anything that regenerates `data/`. Both directories are gitignored;
only one of them can be thrown away.
