const express = require('express');
const path = require('path');
const mysql2 = require('mysql2');
const multer = require('multer');
const app = express();

// Set up view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Body parser middleware
app.use(express.urlencoded({ extended: true }));

// Multer setup for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Database connection
const db = mysql2.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'hawkerhub'
});

// Connect to database
db.connect((err) => {
    if (err) throw err;
    console.log('Connected to database');
});

function checkAuth(req, res, next) {
    let { username, money } = req.query;

    // For POST requests, check the body as well
    if (!username) {
        username = req.body.username;
    }
    if (!money) {
        money = req.body.money;
    }

    if (!username) {
        return res.redirect('/login');
    }

    req.username = username;
    req.money = money;
    next();
}

// Routes
app.get('/', (req, res) => {
    const { username, money } = req.query;
    res.render('index', { username, money });
});

app.get('/contact', (req, res) => {
    const { username, money } = req.query;
    res.render('contact', { username, money });
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    const query = 'SELECT * FROM users WHERE email = ? AND password = ?';
    db.query(query, [email, password], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            const username = results[0].username;
            const money = results[0].money;
            res.redirect(`/?username=${username}&money=${money}`);
        } else {
            res.render('login', { error: 'Incorrect Email and/or Password! Or Email Does not Exist!' });
        }
    });
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.post('/signup', (req, res) => {
    const { username, email, password, money } = req.body;
    const balance = money ? parseFloat(money).toFixed(2) : "0.00";
    console.log(`Received signup data: ${username}, ${email}, ${password}, ${balance}`);

    const checkQuery = 'SELECT * FROM users WHERE username = ? OR email = ?';
    db.query(checkQuery, [username, email], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            // Username or email is taken
            let errorMessage = 'Username/Email is taken';
            if (results[0].username === username) {
                errorMessage = 'Username is taken';
            } else if (results[0].email === email) {
                errorMessage = 'Email is taken';
            }
            res.render('signup', { error: errorMessage });
        } else {
            const query = 'INSERT INTO users (username, email, password, money) VALUES (?, ?, ?, ?)';
            db.query(query, [username, email, password, balance], (err, result) => {
                if (err) {
                    console.error('Error inserting data:', err);
                    res.send('Error occurred during signup');
                } else {
                    console.log('User registered successfully');
                    res.redirect(`/?username=${username}&money=${balance}`);
                }
            });
        }
    });
});


app.get('/profile', checkAuth, (req, res) => {
    const { username } = req.query;
    const query = 'SELECT * FROM users WHERE username = ?';
    db.query(query, [username], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            const user = results[0];
            res.render('profile', { username: user.username, email: user.email, password: user.password, money: user.money, nameTaken: false, emailTaken: false });
        } else {
            res.send('User not found');
        }
    });
});

app.post('/update_profile', (req, res) => {
    const { currentUsername, newUsername, email, password } = req.body;

    const checkQuery = 'SELECT * FROM users WHERE username = ? OR email = ?';
    db.query(checkQuery, [newUsername, email], (err, results) => {
        if (err) throw err;
        const isNameTaken = results.some(user => user.username === newUsername && user.username !== currentUsername);
        const isEmailTaken = results.some(user => user.email === email && user.username !== currentUsername);

        if (isNameTaken || isEmailTaken) {
            const getCurrentUserQuery = 'SELECT * FROM users WHERE username = ?';
            db.query(getCurrentUserQuery, [currentUsername], (err, currentUserResults) => {
                if (err) throw err;
                const currentUser = currentUserResults[0];
                res.render('profile', {
                    username: currentUser.username,
                    email,
                    password,
                    money: currentUser.money,
                    nameTaken: isNameTaken,
                    emailTaken: isEmailTaken
                });
            });
        } else {
            const updateQuery = 'UPDATE users SET username = ?, email = ?, password = ? WHERE username = ?';
            db.query(updateQuery, [newUsername, email, password, currentUsername], (err, result) => {
                if (err) throw err;

                // Retrieve the updated user details including money
                const getUpdatedUserQuery = 'SELECT * FROM users WHERE username = ?';
                db.query(getUpdatedUserQuery, [newUsername], (err, updatedResults) => {
                    if (err) throw err;
                    const updatedUser = updatedResults[0];
                    res.redirect(`/?username=${updatedUser.username}&money=${updatedUser.money}`);
                });
            });
        }
    });
});



app.get('/directory', checkAuth, (req, res) => {
    res.render('directory', { username: req.username, money: req.money });
});

app.get('/preorder', checkAuth, (req, res) => {
    res.render('preorder', { username: req.username, money: req.money });
});

app.get('/logout', (req, res) => {
    res.redirect('/');
});

// Route for managing balance
app.get('/balance', checkAuth, (req, res) => {
    const { username, money } = req.query;
    res.render('balance', { username, money, withdrawError: null });
});

app.post('/topup', (req, res) => {
    const { username, amount } = req.body;
    const parsedAmount = parseFloat(amount).toFixed(2);


    if (isNaN(parsedAmount) || parsedAmount <= 0) {

        return res.send('Invalid top-up amount');
    }

    const query = 'UPDATE users SET money = money + ? WHERE username = ?';
    db.query(query, [parsedAmount, username], (err, result) => {
        if (err) {
            console.error('Error updating balance:', err);
            return res.send('Error occurred during top-up');
        }


        const newQuery = 'SELECT money FROM users WHERE username = ?';
        db.query(newQuery, [username], (err, results) => {
            if (err) {
                console.error('Error fetching new balance:', err);
                return res.send('Error occurred during fetching new balance');
            }


            const newMoney = results[0].money;

            res.redirect(`/?username=${username}&money=${newMoney}`);
        });
    });
});

app.post('/withdraw', (req, res) => {
    const { username, amount } = req.body;
    const parsedAmount = parseFloat(amount).toFixed(2);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        console.log('Invalid withdrawal amount');
        return res.send('Invalid withdrawal amount');
    }

    const getUserQuery = 'SELECT money FROM users WHERE username = ?';
    db.query(getUserQuery, [username], (err, results) => {
        if (err) {
            console.error('Error fetching user balance:', err);
            return res.send('Error occurred during fetching user balance');
        }

        const userMoney = parseFloat(results[0].money);
        if (userMoney < parsedAmount) {
            res.render('balance', {
                username,
                money: userMoney.toFixed(2),
                withdrawError: 'You cannot withdraw more than the amount you have.'
            });
        } else {
            const newBalance = (userMoney - parsedAmount).toFixed(2);
            const query = 'UPDATE users SET money = ? WHERE username = ?';
            db.query(query, [newBalance, username], (err, result) => {
                if (err) {
                    console.error('Error updating balance:', err);
                    return res.send('Error occurred during withdrawal');
                }

                res.redirect(`/?username=${username}&money=${newBalance}`);
            });
        }
    });
});

// Routes for adding, editing, and deleting food items for each hawker center
app.get('/pioneer_mrt', checkAuth, (req, res) => {
    const { username, money } = req.query;
    const query = 'SELECT * FROM pioneer_mrt_food_items';
    db.query(query, (err, results) => {
        if (err) throw err;
        res.render('pioneer_mrt', { username, money, foods: results });
    });
});

app.get('/add_food/pioneer_mrt', checkAuth, (req, res) => {
    const { username, money } = req.query;
    res.render('add_food', { username, money, hawker_center: 'pioneer_mrt' });
});

app.post('/add_food/pioneer_mrt', upload.single('image'), (req, res) => {
    const { name, price, rating } = req.body;
    const image = req.file.filename;
    const query = 'INSERT INTO pioneer_mrt_food_items (name, price, rating, image) VALUES (?, ?, ?, ?)';
    db.query(query, [name, price, rating, image], (err, result) => {
        if (err) throw err;
        res.redirect(`/pioneer_mrt?username=${req.query.username}&money=${req.query.money}`);
    });
});

app.get('/edit_food/pioneer_mrt/:id', checkAuth, (req, res) => {
    const { id } = req.params;
    const { username, money } = req.query;
    const query = 'SELECT * FROM pioneer_mrt_food_items WHERE id = ?';
    db.query(query, [id], (err, results) => {
        if (err) throw err;
        res.render('edit_food', { username, money, foodItem: results[0], hawker_center: 'pioneer_mrt' });
    });
});

app.post('/edit_food/pioneer_mrt/:id', upload.single('image'), (req, res) => {
    const { id } = req.params;
    const { name, price, rating } = req.body;
    let query = 'UPDATE pioneer_mrt_food_items SET name = ?, price = ?, rating = ?';
    const params = [name, price, rating];
    if (req.file) {
        const image = req.file.filename;
        query += ', image = ?';
        params.push(image);
    }
    query += ' WHERE id = ?';
    params.push(id);
    db.query(query, params, (err, result) => {
        if (err) throw err;
        res.redirect(`/pioneer_mrt?username=${req.query.username}&money=${req.query.money}`);
    });
});

app.post('/delete_food/pioneer_mrt/:id', (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM pioneer_mrt_food_items WHERE id = ?';
    db.query(query, [id], (err, result) => {
        if (err) throw err;
        res.redirect(`/pioneer_mrt?username=${req.query.username}&money=${req.query.money}`);
    });
});

app.get('/pioneer_mall', checkAuth, (req, res) => {
    const { username, money } = req.query;
    const query = 'SELECT * FROM pioneer_mall_food_items';
    db.query(query, (err, results) => {
        if (err) throw err;
        res.render('pioneer_mall', { username, money, foods: results });
    });
});

app.get('/add_food/pioneer_mall', checkAuth, (req, res) => {
    const { username, money } = req.query;
    res.render('add_food', { username, money, hawker_center: 'pioneer_mall' });
});

app.post('/add_food/pioneer_mall', upload.single('image'), (req, res) => {
    const { name, price, rating } = req.body;
    const image = req.file.filename;
    const query = 'INSERT INTO pioneer_mall_food_items (name, price, rating, image) VALUES (?, ?, ?, ?)';
    db.query(query, [name, price, rating, image], (err, result) => {
        if (err) throw err;
        res.redirect(`/pioneer_mall?username=${req.query.username}&money=${req.query.money}`);
    });
});

app.get('/edit_food/pioneer_mall/:id', checkAuth, (req, res) => {
    const { id } = req.params;
    const { username, money } = req.query;
    const query = 'SELECT * FROM pioneer_mall_food_items WHERE id = ?';
    db.query(query, [id], (err, results) => {
        if (err) throw err;
        res.render('edit_food', { username, money, foodItem: results[0], hawker_center: 'pioneer_mall' });
    });
});

app.post('/edit_food/pioneer_mall/:id', upload.single('image'), (req, res) => {
    const { id } = req.params;
    const { name, price, rating } = req.body;
    let query = 'UPDATE pioneer_mall_food_items SET name = ?, price = ?, rating = ?';
    const params = [name, price, rating];
    if (req.file) {
        const image = req.file.filename;
        query += ', image = ?';
        params.push(image);
    }
    query += ' WHERE id = ?';
    params.push(id);
    db.query(query, params, (err, result) => {
        if (err) throw err;
        res.redirect(`/pioneer_mall?username=${req.query.username}&money=${req.query.money}`);
    });
});

app.post('/delete_food/pioneer_mall/:id', (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM pioneer_mall_food_items WHERE id = ?';
    db.query(query, [id], (err, result) => {
        if (err) throw err;
        res.redirect(`/pioneer_mall?username=${req.query.username}&money=${req.query.money}`);
    });
});

// Routes for malaysia_boleh_food_items
app.get('/malaysia_boleh', checkAuth, (req, res) => {
    const { username, money } = req.query;
    const query = 'SELECT * FROM malaysia_boleh_food_items';
    db.query(query, (err, results) => {
        if (err) throw err;
        res.render('malaysia_boleh', { username, money, foods: results });
    });
});

app.get('/add_food/malaysia_boleh', checkAuth, (req, res) => {
    const { username, money } = req.query;
    res.render('add_food', { username, money, hawker_center: 'malaysia_boleh' });
});

app.post('/add_food/malaysia_boleh', upload.single('image'), (req, res) => {
    const { name, price, rating } = req.body;
    const image = req.file.filename;
    const query = 'INSERT INTO malaysia_boleh_food_items (name, price, rating, image) VALUES (?, ?, ?, ?)';
    db.query(query, [name, price, rating, image], (err, result) => {
        if (err) throw err;
        res.redirect(`/malaysia_boleh?username=${req.query.username}&money=${req.query.money}`);
    });
});

app.get('/edit_food/malaysia_boleh/:id', checkAuth, (req, res) => {
    const { id } = req.params;
    const { username, money } = req.query;
    const query = 'SELECT * FROM malaysia_boleh_food_items WHERE id = ?';
    db.query(query, [id], (err, results) => {
        if (err) throw err;
        res.render('edit_food', { username, money, foodItem: results[0], hawker_center: 'malaysia_boleh' });
    });
});

app.post('/edit_food/malaysia_boleh/:id', upload.single('image'), (req, res) => {
    const { id } = req.params;
    const { name, price, rating } = req.body;
    let query = 'UPDATE malaysia_boleh_food_items SET name = ?, price = ?, rating = ?';
    const params = [name, price, rating];
    if (req.file) {
        const image = req.file.filename;
        query += ', image = ?';
        params.push(image);
    }
    query += ' WHERE id = ?';
    params.push(id);
    db.query(query, params, (err, result) => {
        if (err) throw err;
        res.redirect(`/malaysia_boleh?username=${req.query.username}&money=${req.query.money}`);
    });
});

app.post('/delete_food/malaysia_boleh/:id', (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM malaysia_boleh_food_items WHERE id = ?';
    db.query(query, [id], (err, result) => {
        if (err) throw err;
        res.redirect(`/malaysia_boleh?username=${req.query.username}&money=${req.query.money}`);
    });
});

// In-memory cart storage for simplicity
let cart = {};

// Route to add item to cart
app.post('/add_to_cart/:hawker_center/:id', checkAuth, (req, res) => {
    const { hawker_center, id } = req.params;
    const { username, money } = req.query;
    const query = `SELECT * FROM ${hawker_center}_food_items WHERE id = ?`;

    db.query(query, [id], (err, results) => {
        if (err) throw err;
        const foodItem = results[0];
        foodItem.hawker_center = hawker_center;  // Add hawker_center to foodItem
        if (!cart[username]) {
            cart[username] = [];
        }
        // Check if item already exists in cart
        const existingItem = cart[username].find(item => item.id == id && item.hawker_center == hawker_center);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            foodItem.quantity = 1;
            cart[username].push(foodItem);
        }
        res.redirect(`/${hawker_center}?username=${username}&money=${money}`);
    });
});

// Route to view cart
app.get('/cart', checkAuth, (req, res) => {
    const { username, money } = req.query;
    const userCart = cart[username] || [];
    res.render('cart', { username, money, cart: userCart });
});

// Route to remove item from cart
app.post('/remove_from_cart', checkAuth, (req, res) => {
    const { foodId, hawker_center, username, money } = req.body;
    
    if (cart[username]) {
        cart[username] = cart[username].filter(item => item.id != foodId || item.hawker_center != hawker_center);
    }

    res.redirect(`/cart?username=${username}&money=${money}`);
});

// Route to update quantity of item in cart
app.post('/update_cart_quantity/:hawker_center/:id', checkAuth, (req, res) => {
    const { hawker_center, id } = req.params;
    const { username, money } = req.body; // changed from req.query to req.body
    const { quantity } = req.body;

    if (cart[username]) {
        cart[username] = cart[username].map(item => {
            if (item.id == id && item.hawker_center == hawker_center) {
                item.quantity = quantity;
            }
            return item;
        });
    }

    res.redirect(`/cart?username=${username}&money=${money}`);
});


// Route to proceed to payment
app.get('/payment', checkAuth, (req, res) => {
    const { username, money, success } = req.query;
    const userCart = cart[username] || [];
    const totalAmount = userCart.reduce((acc, item) => acc + parseFloat(item.price) * item.quantity, 0).toFixed(2);
    res.render('payment', { username, money, cart: userCart, totalAmount, paymentSuccess: success });
});

app.post('/payment', checkAuth, (req, res) => {
    const { username, money, totalAmount } = req.body;
    const userCart = cart[username] || [];
    const totalAmountNum = parseFloat(totalAmount);

    if (parseFloat(money) < totalAmountNum) {
        return res.send(`
            <html>
            <head>
                <meta http-equiv="refresh" content="3;url=/payment?username=${username}&money=${money}">
                <style>
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        font-family: Arial, sans-serif;
                    }
                    .message-box {
                        text-align: center;
                    }
                </style>
            </head>
            <body>
                <div class="message-box">
                    <h2>Insufficient balance</h2>
                    <p>Redirecting you back in 3 seconds...</p>
                </div>
            </body>
            </html>
        `);
    }

    const newBalance = (parseFloat(money) - totalAmountNum).toFixed(2);
    const query = 'UPDATE users SET money = ? WHERE username = ?';

    db.query(query, [newBalance, username], (err, result) => {
        if (err) throw err;
        delete cart[username];  // Clear the cart after payment
        res.redirect(`/payment?username=${username}&money=${newBalance}&success=true`);
    });
});



app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});