// 04 - publisher subscriber pattern

type EventHandler<T=any> = (data: T) => void;

class EventBus {

    private subscriptions = new Map<string, {id: number; handler: EventHandler}[]>();
    private nextId = 1;

    // subscribe to a topic, return unsubscribe func:
    subscribe<T>(topic: string, handler: EventHandler<T>): () => void {
        const id = this.nextId++;

        if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, []); // initialize an empty array for new topic
        }

        this.subscriptions.get(topic)!.push({
            id, handler
        });

        // return an unsubscribe function:
        return () => {
            const subs = this.subscriptions.get(topic);
            if (subs) {
                this.subscriptions.set(
                    topic,
                    subs.filter((s) => s.id !== id),
                );
            }
        }
    };


    // publish an event to topic
    // every subscriber would receive it based on their subscription
    publish<T>(topic: string, data: T): void {
        const subs = this.subscriptions.get(topic) ?? [];

        for (const { handler } of subs) {
            try {
                handler(data);
            } catch (err) {
                console.error(`${topic} error: `, err);
            }
        }
    }

    
    // commonly used for debugging, check for how many subs:
    listnerCount(topic: string) : number {
        return this.subscriptions.get(topic)?.length ?? 0;
    }
}

const bus = new EventBus();

// hypothetical interface
type transactionType = "purchase" | "deposit" | "withdrawl" | "transfer";

interface Transaction {
    id: string;
    account_id: string;
    amount: number;
    type: transactionType;
    date: Date;

    location?: string;
    merchant?: string;
}

interface Alert {
    account_id: string;
    severity: "critical" | "warning" | "info";
    status: "flagged" | "ok";
}

// notification example
bus.subscribe<Transaction>("transaction.completed", (txn) => {
    
    // this is NOT a good example but just to get the flow established fo rmy example:
    const sus = txn.amount > 5000 || (txn.type === "withdrawl" && txn.amount > 2500);

    if (sus) {
        console.log(`Flagged txn ${txn.id}: $${txn.amount} at ${txn.merchant ?? "DNE"}`);

        bus.publish<Alert>("alert.raised", {
            account_id: txn.account_id,
            severity: "critical",
            status: "flagged"
        });
    }
});

bus.subscribe<Alert>("alert.raised", (alert) => {
    if (alert.severity === "critical") {
        console.log("sus");
    }
    // .. logic would follow again, this is just a light implementation.
})

const transactions: Transaction[] = [
    {
        id: "1",
        account_id: "user01",
        type: "purchase",
        amount: 47,
        merchant: "Blue Market",
        location: "local",
        date: new Date(),
    },
    {
        id: "2",
        account_id: "user02",
        type: "purchase",
        amount: 5000,
        merchant: "Ann Laundry",
        location: "foreign",
        date: new Date(),
    }
]

transactions.forEach((txn, i) => {
    console.log(txn);
    bus.publish("transaction.completed", txn);
})