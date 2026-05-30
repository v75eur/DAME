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
if (fs.existsSync(DATA_FILE)) {
    try { joueurs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch(e) {}
}
function sauvegarde() { fs.writeFileSync(DATA_FILE, JSON.stringify(joueurs, null, 2)); }

let resetCodes = [];
let verificationCodes = [];
let duels = [];

// EMAIL avec ton compte Gmail
const mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'ehahounarmelrick@gmail.com', pass: 'rqxirhkkebcafbch' }
});

app.get('/api/pays', (req, res) => res.json(pays));
app.get('/api/stats', (req, res) => res.json({ total: joueurs.length, max: 100 }));
app.get('/api/classement', (req, res) => {
    const top = [...joueurs].sort((a,b) => b.points - a.points).slice(0, 50);
    res.json(top.map(j => ({ pseudo: j.pseudo, points: j.points, flag: j.flag, pays: j.pays, victoires: j.victoires||0, defaites: j.defaites||0 })));
});

// INSCRIPTION AVEC ENVOI DE CODE PAR EMAIL
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
    
    try {
        await mailer.sendMail({
            to: email,
            subject: '🔐 Code de vérification DOOM DAME',
            html: `<div style="background:#0a0000; color:#f80; padding:20px; text-align:center; font-family:monospace;">
                <h1 style="color:#f40">⚔️ DOOM DAME ⚔️</h1>
                <p>Bienvenue <b>${pseudo}</b> !</p>
                <p>Voici votre code de vérification :</p>
                <h2 style="color:#f60; font-size:48px; letter-spacing:5px;">${code}</h2>
                <p>Ce code expire dans 1 heure.</p>
            </div>`
        });
        res.json({ ok: true, msg: 'Code envoyé', email });
    } catch(e) {
        res.json({ ok: false, msg: 'Erreur envoi email' });
    }
});

// VÉRIFICATION DU CODE
app.post('/api/verify', async (req, res) => {
    const { email, code } = req.body;
    const pending = verificationCodes.find(v => v.email === email && v.code === code && v.expires > Date.now());
    if (!pending) return res.json({ ok: false, msg: 'Code invalide ou expiré' });
    
    joueurs.push({
        pseudo: pending.pseudo, email: pending.email, mdp: pending.mdp,
        flag: pending.flag, pays: pending.pays, points: 1000, victoires: 0, defaites: 0
    });
    sauvegarde();
    verificationCodes = verificationCodes.filter(v => v.email !== email);
    res.json({ ok: true, msg: 'Compte activé ! Connectez-vous.' });
});

// RENVOYER LE CODE
app.post('/api/resend-code', (req, res) => {
    const { email } = req.body;
    const pending = verificationCodes.find(v => v.email === email);
    if (!pending) return res.json({ ok: false, msg: 'Aucune demande' });
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    pending.code = newCode;
    pending.expires = Date.now() + 3600000;
    mailer.sendMail({ to: email, subject: 'Nouveau code DOOM DAME', html: `<h1>Nouveau code: ${newCode}</h1>` }).catch(()=>{});
    res.json({ ok: true, msg: 'Nouveau code envoyé' });
});

// CONNEXION
app.post('/api/connexion', async (req, res) => {
    const { pseudo, mdp } = req.body;
    const user = joueurs.find(j => j.pseudo === pseudo);
    if (!user) return res.json({ ok: false, msg: 'Pseudo inconnu' });
    if (!await bcrypt.compare(mdp, user.mdp)) return res.json({ ok: false, msg: 'MDP incorrect' });
    res.json({ ok: true, pseudo: user.pseudo, flag: user.flag });
});

// MOT DE PASSE OUBLIÉ
app.post('/api/forgot', async (req, res) => {
    const { email } = req.body;
    const user = joueurs.find(j => j.email === email);
    if (!user) return res.json({ ok: false, msg: 'Email inconnu' });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    resetCodes.push({ email, code, expires: Date.now() + 900000 });
    mailer.sendMail({ to: email, subject: 'Réinitialisation mot de passe', html: `<h1>Code: ${code}</h1><p>Valable 15 minutes.</p>` }).catch(()=>{});
    res.json({ ok: true, msg: 'Code envoyé' });
});

// RÉINITIALISATION MDP
app.post('/api/reset', async (req, res) => {
    const { email, code, newMdp } = req.body;
    const reset = resetCodes.find(r => r.email === email && r.code === code && r.expires > Date.now());
    if (!reset) return res.json({ ok: false, msg: 'Code invalide' });
    const user = joueurs.find(j => j.email === email);
    if (user) user.mdp = await bcrypt.hash(newMdp, 10);
    sauvegarde();
    res.json({ ok: true, msg: 'Mot de passe modifié ! Connectez-vous.' });
});

// MISE À JOUR SCORE
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 DOOM DAME: http://localhost:${PORT} | ${pays.length} pays`));

// INVITER UN AMI PAR EMAIL
app.post('/api/duel/inviter', async (req, res) => {
    const { pseudo, flag, amiPseudo, amiEmail } = req.body;
    
    // Créer une partie
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    duels.push({ code, joueur1: pseudo, flag1: flag, joueur2: null, statut: 'attente', currentPlayer: 'blue', dernierCoup: null });
    
    // Envoyer l'invitation par email si un email est fourni
    if (amiEmail) {
        const lien = `http://localhost:3000/duel.html?code=${code}`;
        try {
            await mailer.sendMail({
                to: amiEmail,
                subject: `⚔️ DOOM DAME - ${pseudo} vous invite à un duel !`,
                html: `
                    <div style="background:#0a0000; color:#f80; padding:20px; text-align:center; font-family:monospace;">
                        <h1 style="color:#f40">⚔️ DOOM DAME ⚔️</h1>
                        <p><b>${pseudo}</b> vous invite à un duel !</p>
                        <p>Code d'invitation : <b style="font-size:32px;color:#f60">${code}</b></p>
                        <p>Cliquez ici : <a href="${lien}" style="color:#f60">REJOINDRE LA PARTIE</a></p>
                        <p>Ou allez sur DOOM DAME et entrez le code manuellement.</p>
                    </div>
                `
            });
        } catch(e) { console.log('Email non envoyé'); }
    }
    
    res.json({ ok: true, code });
});

// STOCKAGE DES INVITATIONS
let invitations = []; // { id, inviteur, invitePseudo, code, statut, date }

// INVITER UN AMI PAR PSEUDO
app.post('/api/duel/inviter-par-pseudo', async (req, res) => {
    const { inviteurPseudo, inviteurFlag, invitePseudo } = req.body;
    
    // Vérifier si l'inviteur existe
    const inviteur = joueurs.find(j => j.pseudo === inviteurPseudo);
    if (!inviteur) return res.json({ ok: false, msg: 'Vous devez être connecté' });
    
    // Vérifier si l'invité existe
    const invite = joueurs.find(j => j.pseudo === invitePseudo);
    if (!invite) return res.json({ ok: false, msg: 'Ce pseudo n\'existe pas' });
    
    // Vérifier si l'invité n'est pas déjà en duel
    const duelEnCours = duels.find(d => (d.joueur1 === invitePseudo || d.joueur2 === invitePseudo) && d.statut === 'pret');
    if (duelEnCours) return res.json({ ok: false, msg: `${invitePseudo} est déjà en duel` });
    
    // Créer une partie
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    duels.push({ code, joueur1: inviteurPseudo, flag1: inviteurFlag, joueur2: null, statut: 'attente', currentPlayer: 'blue', dernierCoup: null });
    
    // Stocker l'invitation
    const invitation = {
        id: Date.now(),
        inviteur: inviteurPseudo,
        inviteurFlag: inviteurFlag,
        invitePseudo: invitePseudo,
        code: code,
        statut: 'en_attente',
        date: new Date()
    };
    invitations.push(invitation);
    
    // Envoyer un email aussi (optionnel)
    try {
        await mailer.sendMail({
            to: invite.email,
            subject: `⚔️ DOOM DAME - ${inviteurPseudo} vous invite à un duel !`,
            html: `<h1 style="color:#f40">DOOM DAME</h1><p>${inviteurPseudo} vous invite à un duel !</p><p>Code: <b>${code}</b></p><p>Connectez-vous pour rejoindre !</p>`
        });
    } catch(e) {}
    
    res.json({ ok: true, msg: `Invitation envoyée à ${invitePseudo}`, code });
});

// RÉCUPÉRER LES INVITATIONS POUR UN JOUEUR
app.get('/api/duel/mes-invitations/:pseudo', (req, res) => {
    const { pseudo } = req.params;
    const mesInvitations = invitations.filter(i => i.invitePseudo === pseudo && i.statut === 'en_attente');
    res.json({ invitations: mesInvitations });
});

// ACCEPTER UNE INVITATION
app.post('/api/duel/accepter-invitation', (req, res) => {
    const { invitationId, pseudo, flag } = req.body;
    const invitation = invitations.find(i => i.id === parseInt(invitationId));
    
    if (!invitation) return res.json({ ok: false, msg: 'Invitation expirée' });
    if (invitation.statut !== 'en_attente') return res.json({ ok: false, msg: 'Invitation déjà traitée' });
    
    // Rejoindre la partie
    const duel = duels.find(d => d.code === invitation.code);
    if (duel) {
        duel.joueur2 = pseudo;
        duel.flag2 = flag;
        duel.statut = 'pret';
    }
    
    invitation.statut = 'acceptee';
    
    res.json({ ok: true, code: invitation.code });
});

// ANNULER UNE INVITATION
app.post('/api/duel/annuler-invitation', (req, res) => {
    const { invitationId } = req.body;
    const index = invitations.findIndex(i => i.id === parseInt(invitationId));
    if (index !== -1) {
        const code = invitations[index].code;
        const duelIndex = duels.findIndex(d => d.code === code);
        if (duelIndex !== -1) duels.splice(duelIndex, 1);
        invitations.splice(index, 1);
    }
    res.json({ ok: true });
});

// RÉCUPÉRER TOUS LES PSEUDOS POUR LA RECHERCHE
app.get('/api/pseudos', (req, res) => {
    const pseudos = joueurs.map(j => ({ pseudo: j.pseudo, flag: j.flag }));
    res.json(pseudos);
});

// RECHERCHER DES PSEUDOS (filtre)
app.get('/api/rechercher-pseudos/:filtre', (req, res) => {
    const filtre = req.params.filtre.toLowerCase();
    if (filtre.length < 1) {
        res.json([]);
        return;
    }
    const resultats = joueurs
        .filter(j => j.pseudo.toLowerCase().includes(filtre))
        .slice(0, 10)
        .map(j => ({ pseudo: j.pseudo, flag: j.flag }));
    res.json(resultats);
});
