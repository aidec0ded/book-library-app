import { useEffect, useState } from "react";

const QUOTES = [
  { text: "It is what you read when you don\u2019t have to that determines what you will be when you can\u2019t help it.", author: "Oscar Wilde" },
  { text: "Reading \u2013 the best state yet to keep absolute loneliness at bay.", author: "William Styron" },
  { text: "We should read to give our souls a chance to luxuriate.", author: "Henry Miller" },
  { text: "Reading well is one of the great pleasures that solitude can afford you.", author: "Harold Bloom" },
  { text: "To acquire the habit of reading is to construct for yourself a refuge from almost all the miseries of life.", author: "W. Somerset Maugham" },
  { text: "Books are a uniquely portable magic.", author: "Stephen King" },
  { text: "A word after a word after a word is power.", author: "Margaret Atwood" },
  { text: "Some books leave us free and some books make us free.", author: "Ralph Waldo Emerson" },
  { text: "We tell ourselves stories in order to live.", author: "Joan Didion" },
  { text: "Reading is the sole means by which we slip, involuntarily, often helplessly, into another\u2019s skin, another\u2019s voice, another\u2019s soul.", author: "Joyce Carol Oates" },
  { text: "A room without books is like a body without a soul.", author: "Cicero" },
  { text: "Reading is an exercise in empathy; an exercise in walking in someone else\u2019s shoes for a while.", author: "Malorie Blackman" },
  { text: "I guess a big part of serious fiction\u2019s purpose is to give the reader, who like all of us is sort of marooned in her own skull, to give her imaginative access to other selves.", author: "David Foster Wallace" },
  { text: "That is part of the beauty of all literature. You discover that your longings are universal longings, that you\u2019re not lonely and isolated from anyone. You belong.", author: "F. Scott Fitzgerald" },
  { text: "Maybe this is why we read, and why in moments of darkness we return to books: to find words for what we already know.", author: "Alberto Manguel" },
];

function getRandomIndex(exclude: number): number {
  let next: number;
  do {
    next = Math.floor(Math.random() * QUOTES.length);
  } while (next === exclude && QUOTES.length > 1);
  return next;
}

export function ReadingQuote() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((prev) => getRandomIndex(prev));
        setVisible(true);
      }, 1200);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const quote = QUOTES[index];

  return (
    <div className="py-2">
      <p
        className={`font-serif text-2xl italic text-muted-foreground transition-opacity duration-1000 ease-in-out ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        &ldquo;{quote.text}&rdquo;
        <span className="ml-2 not-italic text-lg text-muted-foreground/70">
          &mdash;{quote.author}
        </span>
      </p>
    </div>
  );
}
