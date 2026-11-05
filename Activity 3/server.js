import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { home } from "clash-of-clans-data";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);

const packageEntry = require.resolve("clash-of-clans-data");
const packageRoot = path.dirname(path.dirname(packageEntry));
const imageRoot = path.join(packageRoot, "images");

console.log("======================================");
console.log("        CLASH TROOPS");
console.log("======================================");
console.log(`Server: http://localhost:${PORT}`);
console.log("Official API: https://api.clashofclans.com/v1");
console.log(
    `API Token: ${process.env.COC_API_TOKEN ? "CONFIGURED" : "MISSING"}`
);
console.log("Player Tag: NOT REQUIRED");
console.log("======================================");


function getImage(item) {
    if (!item.images || !item.images.icon) {
        return null;
    }

    let image = item.images.icon
        .replace(/\\/g, "/")
        .replace(/^images\//, "");

    return `/coc-assets/${image}`;
}


function createCharacter(item, type, category) {
    return {
        id: item.id,
        name: item.name,
        type: type,
        category: category,

        description:
            item.description ||
            `Explore ${item.name} in Clash of Clans.`,

        image: getImage(item),

        targetType:
            item.targetType ||
            item.favoriteTarget ||
            "—",

        damageType:
            item.damageType ||
            item.attackType ||
            "—",

        housingSpace:
            item.housingSpace ||
            "—",

        range:
            item.range ||
            "—",

        movementSpeed:
            item.movementSpeed ||
            "—",

        attackSpeed:
            item.attackSpeed ||
            item.attackRate ||
            "—",

        trainingTime:
            item.trainingTime ||
            "—",

        levels: getLevels(item)
    };
}


function getLevels(item) {
    if (!item.levels) {
        return [];
    }

    return item.levels.map(level => {
        return {
            level: level.level || "—",

            damagePerSecond:
                level.damagePerSecond ||
                level.damage ||
                "—",

            damagePerAttack:
                level.damagePerAttack ||
                "—",

            hitpoints:
                level.hitpoints ||
                level.hp ||
                "—",

            cost:
                level.cost ||
                level.upgradeCost ||
                "—",

            costResource:
                level.costResource ||
                level.upgradeCostResource ||
                "—",

            trainingTime:
                level.trainingTime ||
                "—",

            townHallLevel:
                level.townHallLevel ||
                level.townHallRequired ||
                "—"
        };
    });
}


function getCharacters() {
    const characters = [];

    home().troops().get().forEach(item => {
        characters.push(
            createCharacter(
                item,
                "Troop",
                "Troops"
            )
        );
    });

    home().heroes().get().forEach(item => {
        characters.push(
            createCharacter(
                item,
                "Hero",
                "Heroes"
            )
        );
    });

    home().spells().get().forEach(item => {
        characters.push(
            createCharacter(
                item,
                "Spell",
                "Spells"
            )
        );
    });

    home().siegeMachines().get().forEach(item => {
        characters.push(
            createCharacter(
                item,
                "Siege Machine",
                "Siege Machines"
            )
        );
    });

    home().pets().get().forEach(item => {
        characters.push(
            createCharacter(
                item,
                "Pet",
                "Pets"
            )
        );
    });

    home().heroEquipment().get().forEach(item => {
        characters.push(
            createCharacter(
                item,
                "Hero Equipment",
                "Hero Equipment"
            )
        );
    });

    return characters;
}


// GET ALL CHARACTERS

app.get("/characters", (req, res) => {
    try {
        const characters = getCharacters();

        res.json({
            success: true,
            count: characters.length,
            characters: characters
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Unable to load characters",
            error: error.message
        });
    }
});


// GET ONE CHARACTER

app.get("/characters/:id", (req, res) => {
    try {
        const characters = getCharacters();

        const character = characters.find(item =>
            String(item.id).toLowerCase() ===
            String(req.params.id).toLowerCase()
        );

        if (!character) {
            return res.status(404).json({
                success: false,
                message: "Character not found"
            });
        }

        res.json({
            success: true,
            character: character
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Unable to load character",
            error: error.message
        });
    }
});


// CHARACTER IMAGES

app.use(
    "/coc-assets",
    express.static(imageRoot)
);


// OFFICIAL CLASH OF CLANS API

const OFFICIAL_API =
    "https://api.clashofclans.com/v1";


async function cocFetch(endpoint) {
    if (!process.env.COC_API_TOKEN) {
        throw new Error("COC_API_TOKEN is missing.");
    }

    const response = await fetch(
        `${OFFICIAL_API}${endpoint}`,
        {
            headers: {
                Authorization:
                    `Bearer ${process.env.COC_API_TOKEN}`,

                Accept: "application/json"
            }
        }
    );

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `API Error ${response.status}: ${text}`
        );
    }

    return JSON.parse(text);
}


// API INFORMATION

app.get("/api", (req, res) => {
    res.json({
        success: true,
        project: "Clash Troops",
        officialApi: OFFICIAL_API,
        playerTagRequired: false
    });
});


// LOCATIONS

app.get("/locations", async (req, res) => {
    try {
        const data =
            await cocFetch("/locations");

        res.json({
            success: true,
            data: data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


// PLAYER RANKINGS

app.get("/rankings/players", async (req, res) => {
    try {
        const locationId =
            req.query.locationId || "32000000";

        const data =
            await cocFetch(
                `/locations/${locationId}/rankings/players`
            );

        res.json({
            success: true,
            data: data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


// CLAN RANKINGS

app.get("/rankings/clans", async (req, res) => {
    try {
        const locationId =
            req.query.locationId || "32000000";

        const data =
            await cocFetch(
                `/locations/${locationId}/rankings/clans`
            );

        res.json({
            success: true,
            data: data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


// LEAGUES

app.get("/leagues", async (req, res) => {
    try {
        const data =
            await cocFetch("/leagues");

        res.json({
            success: true,
            data: data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


// CAPITAL LEAGUES

app.get("/capital-leagues", async (req, res) => {
    try {
        const data =
            await cocFetch("/capitalleagues");

        res.json({
            success: true,
            data: data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


// HEALTH

app.get("/health", (req, res) => {
    res.json({
        success: true,
        status: "OK",
        apiToken:
            process.env.COC_API_TOKEN
                ? "CONFIGURED"
                : "MISSING",
        playerTag: "NOT REQUIRED"
    });
});


// STATIC WEBSITE

app.use(express.static(__dirname));


app.listen(PORT, () => {
    console.log(
        `Server running at http://localhost:${PORT}`
    );
});