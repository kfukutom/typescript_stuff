// 01 - composition
// loose definition of dependency injection and inversion in composition.
// -> note, code is an rough sketch of what a certains system might entail. not finalized, view it as a rough implementation.

type Status = "Sent" | "Sending" | "Received" | undefined; // various cases of relevant email statuses

interface UserData {
    username: string;
    password: string;
    cc_list: readonly string[]; // carbon-copy clients
    to_list: readonly string[]; // receiving clients
};

interface MessageMeta {
    title: string;
    textContent: string;
    sentDate: undefined | Date;
    sentStatus: Status;
    message_id: string;
};

// strategy pattern / dependency inversion
interface Email {
    sendMessage(metadata: MessageMeta): Promise<void>; // returns status of the sent message
    deleteMessage(message_id: string): Promise<void>;
};

// richer interface for email types that support additional actions
interface RichEmail extends Email {
    favoriteMessage(message_id: string): Promise<void>; // extended behavior not all providers support
}

// handles persistence/transport logic for a message — injected as a dependency
interface MessageStore {
    insert(meta: MessageMeta): Promise<void>;
}

class InMemoryMessageStore implements MessageStore {

    async insert(meta: MessageMeta): Promise<void> {
        // todo
        if (meta.sentStatus != "Sent") {
            // try sending the message naturally
            // on success update the mailing status
            // in ts, treat every variable as a pointer. the reference semantic of typescript makes it like this.
            meta.sentStatus = "Sent";
            return;

        } else {
            throw new Error("Message already sent to client.");
        }
    }
}

class GMail implements RichEmail {

    private userData: UserData;
    private store: MessageStore;

    // inject user data and message store on construction
    constructor(inData: UserData, store: MessageStore) {
        this.userData = inData;
        this.store = store;
    }

    // sends a message to the given address, returns delivery status
    async sendMessage(messageMeta: MessageMeta): Promise<void> {
        try {
            await this.store.insert(messageMeta);
            console.log(messageMeta.sentStatus);  // sanity check on whether or not this interface refers to the updated one from within func.
        } catch (error) {
            console.error(error);
            return;
        }
    }

    // deletes a message by its id
    async deleteMessage(message_id: string): Promise<void> {
        // todo

    }

    // marks a message as favorited
    async favoriteMessage(message_id: string): Promise<void> {
        // todo
    }
}

class Inbox {

    private emailService: Email;

    // accepts any email subtype via dependency injection
    constructor(emailService: Email) {
        this.emailService = emailService;
    }

    // delegates send to the injected email service
    async send(meta: MessageMeta): Promise<void> {
        return await this.emailService.sendMessage(meta);
    }

    // delegates delete to the injected email service
    async delete(id: string): Promise<void> {
        return await this.emailService.deleteMessage(id);
    }
}

function main() {
    // dependency injection — gmails concrete instance passed into inbox
    const inbox_curr = new Inbox(new GMail(
        {
            username: "plinto",
            password: "pwd12", // todo: pull from env in production
            cc_list: ["abc@umich.edu"], // realistically cc list and to_list should be alongside the sent message itself or..
            to_list: ["mygmail@gmail.com"] // FIXME
        },
        new InMemoryMessageStore()
    ));

    const currDate: Date = new Date();
    const temp: MessageMeta = {
        title: "John's Birthday Party - Invite",
        textContent: "",
        sentDate: currDate,
        sentStatus: "Sending",
        message_id: "1eb2fg"
    };

    inbox_curr.send(temp);
    console.log("Success sending message!");

    return;
}; // main function for testing



main();