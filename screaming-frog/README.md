Save your Screaming Frog crawl config here (e.g. `site-check.seospiderconfig`) after following the "Screaming Frog setup" steps in the [top-level README](../README.md), then point `SF_CONFIG_PATH` at it:

```bash
export SF_CONFIG_PATH="$(pwd)/screaming-frog/site-check.seospiderconfig"
```

`.seospiderconfig` files are excluded from git (see `.gitignore`) since they're a local Screaming Frog artifact, not source.
