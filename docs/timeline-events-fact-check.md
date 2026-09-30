# Timeline events fact check

Reviewed the sole entry in [the events seed](../data/timeline/events.seed.json) on September 30, 2026.

## OpenAI incorporation

The December 8, 2015 date is correct for the legal incorporation of OpenAI, Inc., rather than its public announcement.
The Delaware filing stamp on the [certificate of incorporation, Exhibit 1, PDF page 37](https://s.wsj.net/public/resources/documents/musk-suit-openai-altman-march-2024.pdf#page=37) establishes the date and corporation name.
The certificate is reproduced in a court filing hosted by The Wall Street Journal; the filing stamp itself is the evidence used here, not the complaint's allegations.

[Introducing OpenAI](https://openai.com/index/introducing-openai/) is dated December 11, 2015.
OpenAI's [ten-year retrospective](https://openai.com/index/ten-years/) independently identifies December 11 as the public announcement anniversary and distinguishes it from the start of operations in January 2016.
The original source link therefore supported a different milestone from the recorded date.

The event name now explicitly identifies incorporation, `sourceUrl` points to the certificate, and `yearAnnotation` explains the later announcement.
The date and provider remain unchanged; the stable ID, category eligibility and difficulty pool remain game configuration.
Regenerate the combined catalog with `pnpm timeline-merge-to-one` and validate it with `pnpm validate-timeline-data`.
