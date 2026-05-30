const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const pays = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/pays.json'), 'utf8'));
console.log(`🌍 ${pays.length} pays chargés`);

const DATA_FILE = path.join(__dirname, 'players.json');
let joueurs = [];
if (fs.existsSync(DATA_FILE)) { try { joueurs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch(e) {} }
function sauvegarde() { fs.writeFileSync(DATA_FILE, JSON.stringify(joueurs, null, 2)); }

let resetCodes = [];
let verificationCodes = [];
let duels = [];
let invitations = [];

// Configuration email - TON COMPTE GMAIL
const mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'ehahounarmelrick@gmail.com', pass: 'rqxirhkkebcafbch' }
});

// Envoi email asynchrone - NE BLOQUE PAS
function envoyerEmail(destinataire, sujet, html) {
    setImmediate(() => {
        mailer.sendMail({ to: destinataire, subject: sujet, html }).catch(e => console.log('Email erreur:', e.message));
    });
}

// ========== ROUTES ==========
app.get('/api/pays', (req, res) => res.json(pays));
app.get('/api/stats', (req, res) => res.json({ total: joueurs.length, max: 100 }));
app.get('/api/classement', (req, res) => {
    const top = [...joueurs].sort((a,b) => b.points - a.points).slice(0, 50);
    res.json(top.map(j => ({ pseudo: j.pseudo, points: j.points, flag: j.flag, pays: j.pays, victoires: j.victoires||0, defaites: j.defaites||0 })));
});

// INSCRIPTION - Réponse immédiate
app.post('/api/inscription', async (req, res) => {
    const { pseudo, email, mdp, flag, pays } = req.body;
    
    if (!pseudo || !email || !mdp || !flag) return res.json({ ok: false, msg: 'Champs requis' });
    if (pseudo.length < 3) return res.json({ ok: false, msg: 'Pseudo trop court' });
    if (!email.includes('@')) return res.json({ ok: false, msg: 'Email invalide' });
    if (mdp.length < 4) return res.json({ ok: false, msg: 'MDP trop court' });
    if (joueurs.find(j => j.email === email)) return res.json({ ok: false, msg: 'Email déjà utilisé' });
    if (joueurs.find(j => j.pseudo === pseudo)) return res.json({ ok: false, msg: 'Pseudo déjà pris' });
    if (joueurs.length >= 100) return res.json({ ok: false, msg: 'Max 100 joueurs' });
    
    const hash = await bcrypt.hash(mdp, 10);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.push({ pseudo, email, mdp: hash, flag, pays, code, expires: Date.now() + 3600000 });
    
    // Email non bloquant
    envoyerEmail(email, '🔐 Code DOOM DAME', `
        <div style="background:#0a0000;color:#f80;padding:20px;text-align:center;font-family:monospace;">
            <h1 style="color:#f40">⚔️ DOOM DAME ⚔️</h1>
            <p>Bienvenue <b>${pseudo}</b> !</p>
            <p>Code: <b style="font-size:32px">${code}</b></p>
            <p>Valable 1 heure</p>
        </div>
    `);
    
    // Réponse immédiate
    res.json({ ok: true, msg: 'Code envoyé', email });
});

app.post('/api/verify', async (req, res) => {
    const { email, code } = req.body;
    const pending = verificationCodes.find(v => v.email === email && v.code === code && v.expires > Date.now());
    if (!pending) return res.json({ ok: false, msg: 'Code invalide ou expiré' });
    
    joueurs.push({ pseudo: pending.pseudo, email: pending.email, mdp: pending.mdp, flag: pending.flag, pays: pending.pays, points: 1000, victoires: 0, defaites: 0 });
    sauvegarde();
    verificationCodes = verificationCodes.filter(v => v.email !== email);
    res.json({ ok: true, msg: 'Compte activé ! Connectez-vous.' });
});

app.post('/api/resend-code', (req, res) => {
    const { email } = req.body;
    const pending = verificationCodes.find(v => v.email === email);
    if (!pending) return res.json({ ok: false, msg: 'Aucune demande' });
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    pending.code = newCode;
    pending.expires = Date.now() + 3600000;
    envoyerEmail(email, 'Nouveau code DOOM DAME', `<h1>Nouveau code: ${newCode}</h1>`);
    res.json({ ok: true, msg: 'Nouveau code envoyé' });
});

app.post('/api/connexion', async (req, res) => {
    const { pseudo, mdp } = req.body;
    const user = joueurs.find(j => j.pseudo === pseudo);
    if (!user) return res.json({ ok: false, msg: 'Pseudo inconnu' });
    if (!await bcrypt.compare(mdp, user.mdp)) return res.json({ ok: false, msg: 'MDP incorrect' });
    res.json({ ok: true, pseudo: user.pseudo, flag: user.flag });
});

app.post('/api/forgot', async (req, res) => {
    const { email } = req.body;
    const user = joueurs.find(j => j.email === email);
    if (!user) return res.json({ ok: false, msg: 'Email inconnu' });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    resetCodes.push({ email, code, expires: Date.now() + 900000 });
    envoyerEmail(email, 'Réinitialisation mot de passe', `<h1>Code: ${code}</h1><p>Valable 15 minutes.</p>`);
    res.json({ ok: true, msg: 'Code envoyé' });
});

app.post('/api/reset', async (req, res) => {
    const { email, code, newMdp } = req.body;
    const reset = resetCodes.find(r => r.email === email && r.code === code && r.expires > Date.now());
    if (!reset) return res.json({ ok: false, msg: 'Code invalide' });
    const user = joueurs.find(j => j.email === email);
    if (user) user.mdp = await bcrypt.hash(newMdp, 10);
    sauvegarde();
    res.json({ ok: true, msg: 'Mot de passe modifié !' });
});

app.post('/api/score', (req, res) => {
    const { pseudo, victoire } = req.body;
    const user = joueurs.find(j => j.pseudo === pseudo);
    if (!user) return res.json({ ok: false });
    if (victoire) { user.points += 10; user.victoires++; }
    else { user.points = Math.max(0, user.points - 5); user.defaites++; }
    sauvegarde();
    res.json({ ok: true, points: user.points });
});

// ========== MODE DUEL ==========
app.get('/api/pseudos', (req, res) => res.json(joueurs.map(j => ({ pseudo: j.pseudo, flag: j.flag }))));
app.get('/api/rechercher-pseudos/:filtre', (req, res) => {
    const filtre = req.params.filtre.toLowerCase();
    if (filtre.length < 1) { res.json([]); return; }
    const resultats = joueurs.filter(j => j.pseudo.toLowerCase().includes(filtre)).slice(0, 10);
    res.json(resultats.map(j => ({ pseudo: j.pseudo, flag: j.flag })));
});

app.post('/api/duel/creer', (req, res) => {
    const { pseudo, flag } = req.body;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    duels.push({ code, joueur1: pseudo, flag1: flag, joueur2: null, statut: 'attente', currentPlayer: 'blue', dernierCoup: null });
    res.json({ ok: true, code });
});

app.post('/api/duel/rejoindre', (req, res) => {
    const { code, pseudo, flag } = req.body;
    const duel = duels.find(d => d.code === code && d.statut === 'attente');
    if (!duel) return res.json({ ok: false, msg: 'Partie introuvable' });
    duel.joueur2 = pseudo; duel.flag2 = flag; duel.statut = 'pret';
    res.json({ ok: true });
});

app.post('/api/duel/matchmaking', (req, res) => {
    const { pseudo, flag } = req.body;
    let duel = duels.find(d => d.statut === 'attente' && !d.joueur2);
    if (duel) {
        duel.joueur2 = pseudo; duel.flag2 = flag; duel.statut = 'pret';
        res.json({ ok: true, code: duel.code, role: 'invite' });
    } else {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        duels.push({ code, joueur1: pseudo, flag1: flag, joueur2: null, statut: 'attente', currentPlayer: 'blue', dernierCoup: null });
        res.json({ ok: true, code, role: 'createur' });
    }
});

app.get('/api/duel/etat/:code', (req, res) => {
    const duel = duels.find(d => d.code === req.params.code);
    res.json({ statut: duel ? duel.statut : 'inconnu' });
});

app.get('/api/duel/etat-jeu/:code', (req, res) => {
    const duel = duels.find(d => d.code === req.params.code);
    if (!duel) return res.json({});
    const coup = duel.dernierCoup;
    duel.dernierCoup = null;
    res.json({ currentPlayer: duel.currentPlayer, coup });
});

app.post('/api/duel/coup', (req, res) => {
    const { code, coup } = req.body;
    const duel = duels.find(d => d.code === code);
    if (duel) {
        duel.dernierCoup = coup;
        duel.currentPlayer = duel.currentPlayer === 'blue' ? 'red' : 'blue';
        res.json({ ok: true });
    } else res.json({ ok: false });
});

app.post('/api/duel/abandonner', (req, res) => {
    const { code } = req.body;
    const index = duels.findIndex(d => d.code === code);
    if (index !== -1) duels.splice(index, 1);
    res.json({ ok: true });
});

app.get('/api/duel/stats', (req, res) => {
    res.json({ enLigne: duels.length, parties: duels.filter(d => d.statut === 'pret').length });
});

app.post('/api/duel/inviter-par-pseudo', (req, res) => {
    const { inviteurPseudo, inviteurFlag, invitePseudo } = req.body;
    const invite = joueurs.find(j => j.pseudo === invitePseudo);
    if (!invite) return res.json({ ok: false, msg: 'Pseudo inexistant' });
    const duelEnCours = duels.find(d => (d.joueur1 === invitePseudo || d.joueur2 === invitePseudo) && d.statut === 'pret');
    if (duelEnCours) return res.json({ ok: false, msg: `${invitePseudo} est déjà en duel` });
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    duels.push({ code, joueur1: inviteurPseudo, flag1: inviteurFlag, joueur2: null, statut: 'attente', currentPlayer: 'blue', dernierCoup: null });
    invitations.push({ id: Date.now(), inviteur: inviteurPseudo, invitePseudo, code, statut: 'en_attente' });
    envoyerEmail(invite.email, `⚔️ ${inviteurPseudo} vous invite !`, `<h1>${inviteurPseudo} vous invite à un duel !</h1><p>Code: <b>${code}</b></p>`);
    res.json({ ok: true, msg: `Invitation envoyée à ${invitePseudo}`, code });
});

app.get('/api/duel/mes-invitations/:pseudo', (req, res) => {
    const mesInvitations = invitations.filter(i => i.invitePseudo === req.params.pseudo && i.statut === 'en_attente');
    res.json({ invitations: mesInvitations });
});

app.post('/api/duel/accepter-invitation', (req, res) => {
    const { invitationId, pseudo, flag } = req.body;
    const invitation = invitations.find(i => i.id === parseInt(invitationId));
    if (!invitation) return res.json({ ok: false, msg: 'Invitation expirée' });
    if (invitation.statut !== 'en_attente') return res.json({ ok: false, msg: 'Déjà traitée' });
    const duel = duels.find(d => d.code === invitation.code);
    if (duel) { duel.joueur2 = pseudo; duel.flag2 = flag; duel.statut = 'pret'; }
    invitation.statut = 'acceptee';
    res.json({ ok: true, code: invitation.code });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 DOOM DAME: http://localhost:${PORT} | ${pays.length} pays`));
