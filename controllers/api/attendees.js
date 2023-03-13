const Attendee = require('../../models/attendee')
const aws = require('aws-sdk')
const fs = require('fs')


// INDEX ALL ATTENDEES
async function index(req, res, next) {
	try {
		Attendee.find()
			.then((attendees) => {
				return attendees
					.map((attendee) => attendee)
					.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
			})
			.then((attendees) => {
				res.status(200).json({ attendees: attendees })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// SHOW USER ATTENDEES
async function show(req, res, next) {
	try {
		await Attendee.find({ owner: req.user._id })
			.then((attendees) => {
				return attendees
					.map((attendee) => attendee)
					.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
			})
			.then((attendees) => {
				res.status(200).json({ attendees: attendees })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// SHOW ANY ATTENDEES
async function showAll(req, res, next) {
	try {
		await Attendee.findById(req.params.id).then((attendees) => {
			res.status(200).json({ attendees: attendees })
		})
	} catch (error) {
		res.status(400).json(error)
	}
}

// POST
async function create(req, res, next) {
	try {
		let imageUrl, gpxUrl
		if (req.files) {
			aws.config.setPromisesDependency()
			aws.config.update({
				accessKeyId: process.env.AWS_ACCESS_KEY,
				secretAccessKey: process.env.AWS_SECRET_KEY,
				region: process.env.AWS_BUCKET_REGION,
			})
			const s3 = new aws.S3()

					if (req.files.image) {
			const imageParams = {
				ACL: 'public-read',
				Bucket: process.env.AWS_BUCKET_NAME,
				Body: fs.createReadStream(req.files.image[0].path),
				Key: `userImage/${req.files.image[0].originalname}`,
			}
			const imageData = await s3.upload(imageParams).promise()
			fs.unlinkSync(req.files.image[0].path)
			imageUrl = imageData.Location
		}

		if (req.files.gpx) {
			const gpxParams = {
				ACL: 'public-read',
				Bucket: process.env.AWS_BUCKET_NAME,
				Body: fs.createReadStream(req.files.gpx[0].path),
				Key: `gpx/${req.files.gpx[0].originalname}`,
			}
			const gpxData = await s3.upload(gpxParams).promise()
			fs.unlinkSync(req.files.gpx[0].path)
			gpxUrl = gpxData.Location
		}
	}
	
	let attendeeData = {}
	if (req.body.attendee) {
		attendeeData = { ...req.body.attendee }
		if (imageUrl) {
			attendeeData.image = imageUrl
		}
		if (gpxUrl) {
			attendeeData.gpx = gpxUrl
		}
	} else {
		attendeeData = {
			image: imageUrl,
			gpx: gpxUrl
		}
	}
	attendeeData.owner = req.user._id

	const attendee = await Attendee.create(attendeeData)

	res.status(201).json({ attendee })
} catch (error) {
	console.log('Error occurred while trying to upload to S3 bucket', error)
	res.status(400).json(error)
}
}

// PATCH
async function patch(req, res, next) {
	try {
		const attendee = req.body.attendee
		await Attendee.findById(req.params.id)
			.then((attendee) => {
				return attendee.updateOne(req.body.attendee)
			})
			.then((attendee) => {
				res.status(202).json({ attendee: attendee })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// DELETE
async function remove(req, res, next) {
	try {
		await Attendee.findById(req.params.id)
			.then((attendee) => {
				return attendee.deleteOne()
			})
			.then((attendee) => {
				res.status(204).json({ attendee: attendee })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

module.exports = {
	index,
	show,
	create,
	patch,
	remove,
	showAll,
}
