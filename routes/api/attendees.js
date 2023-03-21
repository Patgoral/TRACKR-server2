const express = require('express')
const router= express.Router()
const attendeesCtrl = require('../../controllers/api/attendees')
const multer = require('multer')


// GET /api/attendees
router.get('/', attendeesCtrl.index)


// SHOW /api/attendees/user
router.get('/user', attendeesCtrl.show)

// SHOWALL /api/attendees/:id
router.get('/:id', attendeesCtrl.showAll)



// POST /api/attendees
router.route('/')
.post(multer({ dest: 'temp/',
 limits: { fieldSize: 10 * 1024 * 1024 } 
}).fields([
    {name: 'image', maxCount: 1},
    {name: 'gpx', maxCount: 1},

]
 ), attendeesCtrl.create)


// PATCH /api/attendees/:id
router.patch('/:id', attendeesCtrl.patch)


// DELETE /api/attendees/:id
router.delete('/:id', attendeesCtrl.remove)

router.get('*', attendeesCtrl.index);



module.exports = router