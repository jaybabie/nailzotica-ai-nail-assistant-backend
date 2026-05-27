// src/config/firestore.js
const { db } = require('../lib/firebaseAdmin');

const ALLOWED_TEMPLATE_CREATORS = [
  db.doc('users/wetBZ5XaZGXXtZn92RsT6rmJtGc2'),
  db.doc('users/i1mhx4wmu7CBj5mZkxYX'),
];

async function getCollection(collectionName) {
  let query = db.collection(collectionName);

  if (collectionName === 'finger_templates') {
    query = query.where('createdBy', 'in', ALLOWED_TEMPLATE_CREATORS);
  }

  const snap = await query.get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    docId: doc.id,
    documentId: doc.id,
    ...doc.data(),
  }));
}

module.exports = {
  getCollection,
};