<p align="center">
  <img src="logo.png" width="112" height="112" alt="Compromise logo: a map pin with an approximately-equal sign">
</p>

<h1 align="center">compromise-site</h1>

<p align="center"><strong>Meet in the middle</strong><br>
The website of the Compromise iPhone app.</p>

<p align="center"><a href="https://compromise.alephb.uk">compromise.alephb.uk</a></p>

## What's on the site

- The landing page in English, French, Spanish and German (`en/`, `fr/`, `es/`, `de/`). The root page sends each visitor to their language, and `_data/languages.yml` lists the languages.
- The privacy policy (`privacy.html`).
- The pages that group links open: `join/`, where a friend adds their starting point, and `spots/`, which shows the spots a group was sent.

The TestFlight link the landing pages use is `beta_url` in `_config.yml`.

## Preview locally

GitHub Pages builds the site with Jekyll, from the root of `master`. To preview it:

```sh
gem install jekyll
jekyll serve
```

Then open http://localhost:4000.

## Tests

The tests in `_tests/` use Node and have no dependencies:

```sh
for t in _tests/*.test.js; do node "$t"; done
```

They check the group-link and join page scripts, plus rules every page follows: cache-busted scripts and stylesheets, self-hosted fonts, integrity hashes on outside scripts, and each language's typography. The Test workflow runs `grouplink.test.js` and `site.test.js` on every push and pull request.

## Publishing

Work on a branch and open a pull request. Merging to `master` publishes the site.

## Licence

The fonts are Nunito and Nunito Sans, under the SIL Open Font License (`fonts/OFL.txt`). The rest of the site has no licence, so all rights are reserved.
