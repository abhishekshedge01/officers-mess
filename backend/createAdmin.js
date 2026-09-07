import bcrypt from "bcryptjs";
import { connectDB, getDB } from "./config/db.js";


// =====================================================
// CONNECT DATABASE
// =====================================================

await connectDB();

const db = getDB();


// =====================================================
// ADMIN DETAILS
// =====================================================

const name = "System Admin";

const email = "admin@officersmess.com";

const password = "Admin@12345";


// =====================================================
// CHECK EXISTING ADMIN
// =====================================================

const existingAdmin =
    await db
        .collection("users")
        .findOne({
            email
        });


if (existingAdmin) {

    console.log(
        "Admin already exists"
    );

    process.exit(0);
}


// =====================================================
// HASH PASSWORD
// =====================================================

const hashedPassword =
    await bcrypt.hash(
        password,
        10
    );


// =====================================================
// CREATE ADMIN
// =====================================================

const admin = {

    name,

    email,

    password:
        hashedPassword,

    role:
        "ADMIN",

    messId:
        null,

    createdAt:
        new Date(),

    updatedAt:
        new Date()

};


// =====================================================
// INSERT
// =====================================================

const result =
    await db
        .collection("users")
        .insertOne(admin);


console.log(
    "================================="
);

console.log(
    "ADMIN CREATED SUCCESSFULLY"
);

console.log(
    "Admin ID:",
    result.insertedId.toString()
);

console.log(
    "Email:",
    email
);

console.log(
    "Password:",
    password
);

console.log(
    "Role: ADMIN"
);

console.log(
    "================================="
);


process.exit(0);