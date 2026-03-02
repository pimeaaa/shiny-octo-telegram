import type { JobItem } from "../types/job";

export function getPhobiasPreset(): { topic: string; seriesTitle: string; items: JobItem[] } {
  const items: JobItem[] = [
    { id: "01", name: "Trypophobia", hook: "You might have this and not even know it until you look closely at a sponge.", iconIdea: "Lotus seed pod or honeycomb pattern." },
    { id: "02", name: "Thalassophobia", hook: "It’s not the water you’re afraid of, it’s what’s hiding underneath it.", iconIdea: "Tiny boat above a massive dark underwater shadow." },
    { id: "03", name: "Megalophobia", hook: "Ever felt terrified looking up at a skyscraper or a massive cruise ship?", iconIdea: "Tiny person next to a colossal statue or ship." },
    { id: "04", name: "Nomophobia", hook: "This is the most modern phobia on the list, and you probably have a mild case of it.", iconIdea: "Smartphone with a red X and low battery symbol." },
    { id: "05", name: "Coulrophobia", hook: "Clowns are unsettling because our brains struggle to read painted facial expressions.", iconIdea: "Minimalist clown face, slightly creepy." },
    { id: "06", name: "Acrophobia", hook: "This isn’t just dizziness, it’s a survival instinct in overdrive.", iconIdea: "Person looking over the edge of a steep cliff." },
    { id: "07", name: "Arachnophobia", hook: "Evolution may have hardwired us to fear spiders before we even think.", iconIdea: "Simple black spider silhouette." },
    { id: "08", name: "Nyctophobia", hook: "You aren’t afraid of the dark, you’re afraid of what’s in the dark with you.", iconIdea: "Glowing eyes inside a black circle." },
    { id: "09", name: "Claustrophobia", hook: "It’s the panic of feeling trapped with no way out.", iconIdea: "Person squeezed between two closing walls." },
    { id: "10", name: "Chronophobia", hook: "A ticking clock can trigger real dread about time passing.", iconIdea: "Hourglass running out of sand." },
    { id: "11", name: "Anatidaephobia", hook: "Somewhere, somehow, a duck is watching you.", iconIdea: "Duck peeking from behind a corner." },
    { id: "12", name: "Agoraphobia", hook: "Not fear of outside, fear of panic with no escape.", iconIdea: "Open door and a person refusing to cross the threshold." }
  ];

  return {
    topic: "Phobias",
    seriesTitle: "The Phobia Grid (12 Items)",
    items
  };
}

export function getMentalDisordersPreset() {
  return {
    topic: "mental disorders",
    seriesTitle: "Mental Disorders Grid (3 Items)",
    items: [
      {
        id: "01",
        name: "OCD (Obsessive-Compulsive Disorder)",
        hook: "It's not just being tidy, it's intrusive thoughts you can't turn off.",
        iconIdea: "A looping arrow circle around a small checklist."
      },
      {
        id: "02",
        name: "ADHD (Attention-Deficit/Hyperactivity Disorder)",
        hook: "It's not laziness, it's a brain struggling to regulate focus and momentum.",
        iconIdea: "A lightning bolt splitting into multiple smaller arrows."
      },
      {
        id: "03",
        name: "Social Anxiety Disorder",
        hook: "It's not shyness, it's fear of being judged that hijacks your body.",
        iconIdea: "A small person under a spotlight, surrounded by faint eye icons."
      }
    ]
  };
}