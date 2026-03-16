// 03 - parametric polymorphism

interface Notification {
    send(): void;
    format(): string;
}

export class SafeQueue<T> {
    private items: T[] = [];

    enqueue(child: T): void {
        this.items.push(child);
    }

    dequeue(child: T): T | undefined {
        return this.items.shift();
    }

    peek(): T | undefined {
        return this.items[0];
    }

    isEmpty(): boolean {
        return this.items.length === 0;
    }
} // loose implementation for syntax


// bounded type parameters
function broadcastAll<T extends Notification>(q: T[]) : void {
    for (const item of q) {
        console.log(item.format());
        item.send();
    }
}

export {};  // file as module