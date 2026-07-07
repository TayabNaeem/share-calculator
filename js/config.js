/* =====================================================================
   config.js — app configuration & reference data
   ===================================================================== */

/* ===== OWNER: this email always has full control and manages all users. =====
   Change this to your own owner email (must match the Firestore rules). */
const OWNER_EMAIL = "tayyabnaem26102001@gmail.com";

/* =====================================================================
   SETUP — PASTE YOUR FIREBASE CONFIG HERE
   1. https://console.firebase.google.com → create a project (free)
   2. Add a Web app (</>) and copy its firebaseConfig object
   3. Enable Authentication → Email/Password (and Google)
   4. Create a Firestore Database and publish the rules from README.md
   ===================================================================== */
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBH9s4TNFYlb4I0LP3E6kYSR_1iJ9JqKV4",
    authDomain: "share-calculator-768c0.firebaseapp.com",
    projectId: "share-calculator-768c0",
    storageBucket: "share-calculator-768c0.firebasestorage.app",
    messagingSenderId: "940212101506",
    appId: "1:940212101506:web:7b2e27ba839569e270af9b",
    measurementId: "G-8J1H4NHNGC"
};

/* Shared with the ES-module (auth.js) which has its own scope. */
window.APP_CONFIG = { OWNER_EMAIL, FIREBASE_CONFIG };

/* Palette-locked accent colours (only navy / coral / gold / white) */
const COLOR = {
    gold:  '#FFCD57',   // positive · received
    coral: '#E14B5E',   // attention · pending · primary
    white: '#EEF2F8',
};

/* ---------- Reference data ---------- */
const COURSES = [
    { id:'vibeCoding', name:'Vibe Coding' },
    { id:'automation', name:'Ai Automation' },
    { id:'chatbot',    name:'Ai Chatbot' },
    { id:'ghl',        name:'Go High Level' },
    { id:'shopify',    name:'Shopify' },
    { id:'seo',        name:'SEO' },
    { id:'wordpress',  name:'WordPress' },
];
const COURSE_NAME = Object.fromEntries(COURSES.map(c => [c.id, c.name]));

const BUNDLES = [
    { id:'single', name:'Single Course', count:1, accent:'#FFCD57' },
    { id:'double', name:'Double Bundle', count:2, accent:'#E14B5E' },
    { id:'triple', name:'Triple Bundle', count:3, accent:'#EEF2F8' },
];
const BUNDLE = Object.fromEntries(BUNDLES.map(b => [b.id, b]));

/* Profit-share config */
const TEAM = ["Ammad", "Tayyab Naeem", "Umar", "Khizar", "Tayyab Ali"];
const SHARE_LEAD = { vibeCoding:null, automation:"Ammad", chatbot:"Tayyab Naeem", ghl:"Ammad", shopify:"Tayyab Naeem", seo:"Tayyab Ali", wordpress:"Umar" };
