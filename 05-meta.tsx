// 05-zod.ts
// more with zod

import { z } from "zod";

export const INVALID_REASONS = ["too_short", "missing_center", "not_in_dictionary"] as const;

// continuation of SpellingBee game class
const GuessParamsSchema = z.object({
    guessed_word: z.string().toLowerCase(),
}).readonly();

const GuessResultSchema = z.discriminatedUnion("status", [
    z.object({
        status: z.literal("rejected"),
        reason: z.enum(["duplicate"]),
    }).readonly(),
    z.object({
        status: z.literal("completed"),
        evaluation: z.discriminatedUnion("kind", [
            z.object({
                kind: z.literal("accepted"),
                is_pangram: z.boolean(),
                points_earned: z.number().int().nonnegative(),
            }).readonly(),
            z.object({
                kind: z.literal("rejected"),
                reason: z.enum(INVALID_REASONS),
            }).readonly(),
        ]),
    }).readonly(),
]);

// define convenience types
type GuessParams = z.infer<typeof GuessParamsSchema>;
type GuessResult = z.infer<typeof GuessResultSchema>;

export class SpellingBeeGame {

    private uniqueCharacters: Set<string> = new Set();

    constructor(inUnique: string) {
        for (const ch of inUnique) {
            this.uniqueCharacters.add(ch);
        }
    }

    public attempt_guess(params: GuessParams): GuessResult {
        const { guessed_word } = params;
        console.log(`User guessed: ${guessed_word.toUpperCase()}`);

        if (guessed_word.length < 4) {
            return {
                status: "completed",
                evaluation: {
                    kind: "rejected",
                    reason: "too_short"
                }
            };
        }

        return { status: "completed", evaluation: {
            kind: "accepted",
            is_pangram: this.checkPangram(guessed_word),
            points_earned: this.scoreWord(guessed_word),
        } };
    }

    // helper functions
    private checkPangram(in_word: string): boolean {
        // temporary implementation
        if (in_word.length > 10) {
            return false;
        }
        return true;
    }

    // NOT reflective of how scoring would actually be
    // for sake of demo
    private scoreWord(in_word: string): number {
        let earnedPoint: number = 0;
        for (const ch of in_word) {
            if (this.uniqueCharacters.has(ch)) {
                earnedPoint += 1;
            }
        }
        return earnedPoint;
    }
}

// ex workflow
function main() {
    const game: SpellingBeeGame = new SpellingBeeGame("oplabec");

    // simulate guess
    const guesses = ["able", "cab", "capable", "pole"];

    for (const word of guesses) {
        const parsed = GuessParamsSchema.safeParse({ guessed_word: word });
        if (!parsed.success) {
            console.error(`Invalid input: ${parsed.error}`);
            continue;
        }

        const result = game.attempt_guess(parsed.data);
        console.log(`Result for "${word}":`, JSON.stringify(result, null, 2));
    }
}

main();