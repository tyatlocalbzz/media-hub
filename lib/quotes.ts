export interface Quote {
  text: string
  author: string
  context?: string
}

export const inspiringQuotes: Quote[] = [
  {
    text: "The ultimate measure of a man is not where he stands in moments of comfort and convenience, but where he stands at times of challenge and controversy.",
    author: "Martin Luther King Jr.",
    context: "Civil Rights Leader"
  },
  {
    text: "I have learned over the years that when one's mind is made up, this diminishes fear.",
    author: "Rosa Parks",
    context: "Civil Rights Activist"
  },
  {
    text: "It is during our darkest moments that we must focus to see the light.",
    author: "Aristotle Onassis",
    context: "Greek Shipping Magnate"
  },
  {
    text: "We must accept finite disappointment, but never lose infinite hope.",
    author: "Cesar Chavez",
    context: "Labor Rights Activist"
  },
  {
    text: "The cave you fear to enter holds the treasure you seek.",
    author: "Joseph Campbell",
    context: "American Mythologist"
  },
  {
    text: "Success is not final, failure is not fatal: it is the courage to continue that counts.",
    author: "Maya Angelou",
    context: "Poet & Civil Rights Activist"
  },
  {
    text: "Don't be discouraged. It's often the last key in the bunch that opens the lock.",
    author: "Harriet Tubman",
    context: "Abolitionist"
  },
  {
    text: "Out of suffering have emerged the strongest souls; the most massive characters are seared with scars.",
    author: "Kahlil Gibran",
    context: "Lebanese-American Writer"
  },
  {
    text: "When everything seems to be going against you, remember that the airplane takes off against the wind.",
    author: "Wilma Mankiller",
    context: "First Female Cherokee Chief"
  },
  {
    text: "I am fundamentally an optimist. Part of being optimistic is keeping one's head pointed toward the sun.",
    author: "Nelson Mandela",
    context: "South African President"
  },
  {
    text: "Turn your wounds into wisdom.",
    author: "Oprah Winfrey",
    context: "Media Pioneer"
  },
  {
    text: "The best time to plant a tree was 20 years ago. The second best time is now.",
    author: "Chinese Proverb",
    context: "Ancient Wisdom"
  },
  {
    text: "Fall seven times, stand up eight.",
    author: "Japanese Proverb",
    context: "Traditional Saying"
  },
  {
    text: "However difficult life may seem, there is always something you can do and succeed at.",
    author: "Stephen Hawking",
    context: "Theoretical Physicist"
  },
  {
    text: "I've missed more than 9,000 shots in my career. I've failed over and over in my life. And that is why I succeed.",
    author: "Michael Jordan",
    context: "Basketball Legend"
  },
  {
    text: "We may encounter many defeats but we must not be defeated.",
    author: "Malcolm X",
    context: "Human Rights Activist"
  },
  {
    text: "The flower that blooms in adversity is the most rare and beautiful of all.",
    author: "Mulan",
    context: "Chinese Legend"
  },
  {
    text: "Rock bottom became the solid foundation on which I rebuilt my life.",
    author: "J.K. Rowling",
    context: "Author"
  },
  {
    text: "In the middle of difficulty lies opportunity.",
    author: "Albert Einstein",
    context: "Physicist"
  },
  {
    text: "My mission in life is not merely to survive, but to thrive.",
    author: "Frida Kahlo",
    context: "Mexican Artist"
  }
]

export function getRandomQuote(): Quote {
  return inspiringQuotes[Math.floor(Math.random() * inspiringQuotes.length)]
}