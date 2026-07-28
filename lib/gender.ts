/**
 * Lightweight, local name→gender guess used ONLY to bias avatar styling
 * (hairstyles / facial hair). Deliberately conservative: anything not clearly
 * recognized returns null and the avatar keeps the full unrestricted variety.
 * No external requests, nothing stored.
 */

const FEMALE = new Set([
  "anna", "lea", "leah", "mia", "emma", "julia", "juliane", "laura", "sarah", "sara", "lisa",
  "marie", "maria", "mary", "sophie", "sofia", "sophia", "hannah", "hanna", "lena", "nadia",
  "nadja", "clara", "klara", "johanna", "katharina", "katrin", "kathrin", "christina", "christine",
  "nina", "jana", "melanie", "sandra", "nicole", "jessica", "vanessa", "franziska", "theresa",
  "teresa", "paula", "charlotte", "ella", "ida", "greta", "luisa", "louisa", "amelie", "antonia",
  "carla", "karla", "elena", "elisa", "elisabeth", "emilia", "frieda", "helena", "isabel",
  "isabella", "isabelle", "josephine", "leni", "lina", "lotta", "maja", "maya", "marlene",
  "martha", "mathilda", "matilda", "merle", "mila", "nele", "nora", "pia", "romy", "selma",
  "stella", "tilda", "valentina", "victoria", "viktoria", "zoe", "alina", "carina", "celine",
  "chiara", "daniela", "diana", "eva", "gina", "iris", "kira", "larissa", "mara", "michelle",
  "miriam", "monika", "petra", "rebecca", "rebekka", "ronja", "ruth", "silke", "svenja", "tanja",
  "ute", "verena", "yvonne", "mira", "amelia", "alice", "grace", "olivia", "ava", "lily", "ellie",
  "chloe", "lucy", "emily", "kate", "katie", "jane", "rose", "ivy", "esther", "judith", "rachel",
  "naomi", "leonie", "melina", "annika", "birgit", "claudia", "sabine", "susanne", "heike",
]);

const MALE = new Set([
  "jesper", "julian", "jonas", "max", "maximilian", "felix", "paul", "leon", "lukas", "lucas",
  "finn", "fynn", "noah", "elias", "ben", "luis", "louis", "henry", "henri", "theo", "theodor",
  "anton", "emil", "oskar", "oscar", "karl", "carl", "moritz", "david", "daniel", "tim", "tom",
  "thomas", "jan", "nils", "niels", "lars", "sven", "erik", "eric", "alexander", "andreas",
  "christian", "christoph", "christopher", "dennis", "dominik", "fabian", "florian", "jakob",
  "jacob", "jannik", "yannik", "yannick", "johannes", "kevin", "marcel", "marco", "mario",
  "markus", "marcus", "martin", "matthias", "michael", "niklas", "nicklas", "patrick", "peter",
  "philipp", "philip", "rafael", "raphael", "rene", "robert", "sebastian", "simon", "stefan",
  "stephan", "tobias", "vincent", "samuel", "adrian", "aaron", "benedikt", "bastian", "sören",
  "carsten", "clemens", "constantin", "konstantin", "frank", "georg", "hannes", "hendrik",
  "jonathan", "josef", "joseph", "kai", "leo", "linus", "lorenz", "ludwig", "manuel", "mats",
  "nico", "nick", "ole", "pascal", "richard", "till", "timo", "valentin", "victor", "viktor",
  "wilhelm", "james", "john", "jack", "george", "william", "harry", "oliver", "ethan", "liam",
  "mason", "logan", "ryan", "nathan", "adam", "arthur", "frederik", "frederick", "gustav",
]);

export function nameGender(displayName: string): "f" | "m" | null {
  const first = displayName.trim().toLowerCase().split(/[\s._-]+/)[0] ?? "";
  if (FEMALE.has(first)) return "f";
  if (MALE.has(first)) return "m";
  // Mild suffix heuristic for names outside the lists.
  if (/(ah|ia|ina|ine|ika|ette|elle)$/.test(first) && first.length >= 4) return "f";
  return null;
}
