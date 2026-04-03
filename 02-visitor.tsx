// 02 - visitor pattern in software design

interface NodeVisitor {
    visitRoadway(roadway: Roadway): void;
    visitIntersection(intersect: Intersection): void;
}

interface MyNode {
    move(x: number, y: number): void;
    accept(v: NodeVisitor): void;
}

class Roadway implements MyNode {
    public lat: number;
    public lon: number;
    public rid: string;

    constructor(lat: number, lon: number, rid: string) {
        this.lat = lat;
        this.lon = lon;
        this.rid = rid;
    }

    move(x: number, y: number): void {
        this.lat += x;
        this.lon += y;
    }

    accept(v: NodeVisitor): void {
        v.visitRoadway(this);
    }
}

class Intersection implements MyNode {
    public lat: number;
    public lon: number;
    public iid: string;

    constructor(lat: number, lon: number, iid: string) {
        this.lat = lat;
        this.lon = lon;
        this.iid = iid;
    }

    move(x: number, y: number): void {
        this.lat += x;
        this.lon += y;
    }

    accept(v: NodeVisitor): void {
        v.visitIntersection(this);
    }
}

class XMLExportVisitor implements NodeVisitor {

    visitRoadway(node: Roadway): void {
        console.log(
            `<roadway id="${node.rid}" lat="${node.lat}" lon="${node.lon}" />`
        );
    }

    visitIntersection(node: Intersection): void {
        console.log(
            `<intersection id="${node.iid}" lat="${node.lat}" lon="${node.lon}" />`
        );
    }
}


// simple usage of the pattern

// a. application / client code as a class
// the visitor pattern adheres to adhoc polymorphism (key -> adding new variants is difficult, however w methods it might be more lenient)
class Application {

    private node_list: readonly MyNode[];

    constructor(node_list: MyNode[]) {
        this.node_list = node_list;
    }

    exportXML() {
        // export variant for XML
        const exporter = new XMLExportVisitor();
        this.node_list.forEach((child) => {
            try {
                child.accept(exporter);
            } catch (error) {
                console.error(error);
                return;
            }
        });

        console.log("[COMPLETE] Export to XML format is finished.");
    }
}

// --------------- example usage ---------------

const nodes: MyNode[] = [
    new Roadway( 71.651, -65.443, "r_001" ),
    new Intersection( 73.651, -68.443, "i_001" ),
    new Intersection( 74.566, -67.665, "i_002" )
];

const app: Application = new Application(nodes);
app.exportXML();